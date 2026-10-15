import { describe, expect, it } from "vitest";

import { reviewProviderSchema } from "@/features/admin/schemas";
import { signUpSchema } from "@/features/auth/schemas";
import { newExperienceSchema, providerApplicationSchema } from "@/features/providers/schemas";
import { parseInput } from "@/lib/validation";

const UUID = "5eed0000-0000-4000-8000-000000000001";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.append(k, v);
  return data;
}

describe("parseInput", () => {
  it("ignores React $ACTION_ fields but rejects other unknown keys", () => {
    const ok = form({
      $ACTION_ID_abc: "",
      accountType: "traveller",
      email: "a@b.co",
      password: "longenough",
      displayName: "A",
    });
    expect(parseInput(signUpSchema, ok).email).toBe("a@b.co");

    const tampered = form({
      accountType: "traveller",
      email: "a@b.co",
      password: "longenough",
      displayName: "A",
      role: "admin",
    });
    expect(() => parseInput(signUpSchema, tampered)).toThrow(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    // Admin is never self-serve (ADR-0007).
    expect(() =>
      parseInput(
        signUpSchema,
        form({ accountType: "admin", email: "a@b.co", password: "longenough", displayName: "A" }),
      ),
    ).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  });

  it("reports field errors", () => {
    try {
      parseInput(signUpSchema, form({ email: "nope", password: "short", displayName: "" }));
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "VALIDATION_FAILED" });
      const fields = Object.keys((error as { fieldErrors: object }).fieldErrors);
      expect(fields).toEqual(expect.arrayContaining(["email", "password", "displayName"]));
    }
  });
});

describe("providerApplicationSchema", () => {
  const valid = {
    slug: "Ziro-Treks",
    displayName: "Ziro Treks",
    legalName: "Ziro Treks Pvt Ltd",
    contactEmail: "hello@zirotreks.example",
  };

  it("normalises the slug and defaults optional fields", () => {
    expect(providerApplicationSchema.parse(valid)).toMatchObject({
      slug: "ziro-treks",
      description: "",
      district: "",
      contactPhone: "",
    });
  });

  it.each(["a", "has space", "double--hyphen", "-leading", "UPPER_case"])(
    "rejects slug %j",
    (slug) => {
      expect(providerApplicationSchema.safeParse({ ...valid, slug }).success).toBe(false);
    },
  );

  it("cannot smuggle a status field", () => {
    expect(providerApplicationSchema.safeParse({ ...valid, status: "verified" }).success).toBe(
      false,
    );
  });
});

describe("newExperienceSchema", () => {
  const base = {
    providerId: UUID,
    destinationId: UUID,
    slug: "ziro-walk",
    title: "Ziro walk",
    category: "culture",
    durationMinutes: "120",
    listingType: "experience",
    priceUnit: "per_person",
  };

  it("enforces each listing type's fields (ADR-0008)", () => {
    const stay = {
      ...base,
      listingType: "stay",
      priceUnit: "per_room_night",
      durationMinutes: "1440",
    };
    expect(newExperienceSchema.safeParse(stay).success).toBe(false); // rooms and guests required
    expect(
      newExperienceSchema.safeParse({ ...stay, dailyCapacity: "3", maxGuests: "2" }).success,
    ).toBe(true);
    expect(
      newExperienceSchema.safeParse({
        ...stay,
        priceUnit: "per_person",
        dailyCapacity: "3",
        maxGuests: "2",
      }).success,
    ).toBe(false);
    expect(newExperienceSchema.safeParse({ ...base, routeToDestinationId: UUID }).success).toBe(
      false,
    ); // only transport has a route
    const guide = newExperienceSchema.parse({
      ...base,
      listingType: "guide",
      priceUnit: "per_person_day",
      dailyCapacity: "1",
      maxGuests: "8",
      languages: " English , Hindi,, Apatani ",
    });
    expect(guide.languages).toEqual(["English", "Hindi", "Apatani"]);
    expect(newExperienceSchema.safeParse({ ...base, languages: "<script>" }).success).toBe(false);
  });

  it("converts whole rupees to paise and treats blank as no price", () => {
    expect(newExperienceSchema.parse({ ...base, priceFromRupees: "1500" }).priceFromRupees).toBe(
      150000,
    );
    expect(newExperienceSchema.parse({ ...base, priceFromRupees: "" }).priceFromRupees).toBeNull();
    expect(newExperienceSchema.parse(base).priceFromRupees).toBeNull();
  });

  it("rejects negative prices, out-of-range durations and unknown categories", () => {
    expect(newExperienceSchema.safeParse({ ...base, priceFromRupees: "-1" }).success).toBe(false);
    expect(newExperienceSchema.safeParse({ ...base, durationMinutes: "5" }).success).toBe(false);
    expect(newExperienceSchema.safeParse({ ...base, category: "casino" }).success).toBe(false);
  });

  it("cannot set status on creation", () => {
    expect(newExperienceSchema.safeParse({ ...base, status: "published" }).success).toBe(false);
  });
});

describe("reviewProviderSchema", () => {
  it("only accepts admin decisions", () => {
    expect(
      reviewProviderSchema.safeParse({ providerId: UUID, decision: "pending_review" }).success,
    ).toBe(false);
    expect(reviewProviderSchema.parse({ providerId: UUID, decision: "verified" }).note).toBe("");
  });
});
