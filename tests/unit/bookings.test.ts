import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";
import { effectiveStatus, slotStartsAt, travelerCanCancel } from "@/lib/booking-options";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
const repo = {
  requestBooking: vi.fn(),
  respondToBooking: vi.fn(),
  cancelBooking: vi.fn(),
  createSlot: vi.fn(),
  updateSlot: vi.fn(),
};
vi.mock("@/server/bookings/repository", () => ({
  requestBooking: (...a: unknown[]) => repo.requestBooking(...a),
  respondToBooking: (...a: unknown[]) => repo.respondToBooking(...a),
  cancelBooking: (...a: unknown[]) => repo.cancelBooking(...a),
  createSlot: (...a: unknown[]) => repo.createSlot(...a),
  updateSlot: (...a: unknown[]) => repo.updateSlot(...a),
}));

const actions = await import("@/features/bookings/actions");

const ID = "5eed0000-0000-4000-8000-000000000001";
const KEY = "f0000000-0000-4000-8000-000000000001";
const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.append(k, v);
  return data;
};

beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockReset();
  redirect.mockReset();
});

describe("booking display rules", () => {
  const now = new Date("2026-11-01T06:30:00Z"); // 12:00 IST

  it("treats slot dates as India time", () => {
    expect(slotStartsAt("2026-11-02", null).toISOString()).toBe("2026-11-01T18:30:00.000Z");
    expect(slotStartsAt("2026-11-02", "09:30:00").toISOString()).toBe("2026-11-02T04:00:00.000Z");
  });

  it("shows an overdue request as expired before the sweep records it", () => {
    expect(effectiveStatus("requested", "2026-11-01T06:00:00Z", now)).toBe("expired");
    expect(effectiveStatus("requested", "2026-11-01T07:00:00Z", now)).toBe("requested");
    expect(effectiveStatus("confirmed", "2026-11-01T06:00:00Z", now)).toBe("confirmed");
  });

  it("lets travelers cancel requests any time and confirmed bookings until 24 h before", () => {
    const later = "2026-12-01T00:00:00Z";
    expect(travelerCanCancel("requested", slotStartsAt("2026-11-01", "13:00:00"), later, now)).toBe(
      true,
    );
    expect(travelerCanCancel("confirmed", slotStartsAt("2026-11-02", "12:00:00"), later, now)).toBe(
      true,
    ); // exactly 24 h
    expect(travelerCanCancel("confirmed", slotStartsAt("2026-11-02", "11:59:00"), later, now)).toBe(
      false,
    );
    for (const s of ["declined", "cancelled", "expired", "completed"] as const) {
      expect(travelerCanCancel(s, slotStartsAt("2027-01-01", null), later, now)).toBe(false);
    }
    expect(
      travelerCanCancel("requested", slotStartsAt("2027-01-01", null), "2026-11-01T06:00:00Z", now),
    ).toBe(false);
  });
});

describe("requestBookingAction", () => {
  const valid = {
    slotId: ID,
    adults: "2",
    children: "1",
    contactPhone: "+91 98765 43210",
    note: "",
    idempotencyKey: KEY,
  };

  it("passes validated input (with the form's idempotency key) and redirects to the booking", async () => {
    repo.requestBooking.mockResolvedValue({
      bookingId: ID,
      reference: "HV-ABCDEF",
      replayed: false,
    });
    await actions.requestBookingAction(null, form(valid));
    expect(repo.requestBooking).toHaveBeenCalledWith({
      slotId: ID,
      adults: 2,
      children: 1,
      contactPhone: "+91 98765 43210",
      note: "",
      idempotencyKey: KEY,
    });
    expect(redirect).toHaveBeenCalledWith(`/bookings/${ID}`);
  });

  it.each([
    [{ adults: "0" }, "adults"],
    [{ adults: "15", children: "6" }, "children"],
    [{ contactPhone: "call me" }, "contactPhone"],
    [{ idempotencyKey: "not-a-uuid" }, "idempotencyKey"],
    [{ slotId: "" }, "slotId"],
  ])("rejects %j before calling the database", async (patch, field) => {
    const result = await actions.requestBookingAction(null, form({ ...valid, ...patch }));
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    if (result && !result.ok) expect(Object.keys(result.error.fieldErrors ?? {})).toContain(field);
    expect(repo.requestBooking).not.toHaveBeenCalled();
  });

  it("refuses client-supplied price, provider or status fields", async () => {
    const extras: Record<string, string>[] = [
      { price: "1" },
      { providerId: ID },
      { status: "confirmed" },
      { travelerId: ID },
    ];
    for (const extra of extras) {
      const result = await actions.requestBookingAction(null, form({ ...valid, ...extra }));
      expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    }
    expect(repo.requestBooking).not.toHaveBeenCalled();
  });

  it("surfaces database refusals safely", async () => {
    repo.requestBooking.mockRejectedValue(
      new AppError("CONFLICT", "You already have an active booking for this date."),
    );
    expect(await actions.requestBookingAction(null, form(valid))).toEqual({
      ok: false,
      error: { code: "CONFLICT", message: "You already have an active booking for this date." },
    });
  });
});

describe("respondToBookingAction", () => {
  it("requires a final price to confirm and a reason to decline", async () => {
    const noPrice = await actions.respondToBookingAction(
      null,
      form({ bookingId: ID, decision: "confirmed", finalTotalRupees: "" }),
    );
    expect(noPrice).toMatchObject({
      ok: false,
      error: { fieldErrors: { finalTotalRupees: expect.any(Array) } },
    });
    const noReason = await actions.respondToBookingAction(
      null,
      form({ bookingId: ID, decision: "declined", note: " " }),
    );
    expect(noReason).toMatchObject({
      ok: false,
      error: { fieldErrors: { note: expect.any(Array) } },
    });
    const badDecision = await actions.respondToBookingAction(
      null,
      form({ bookingId: ID, decision: "completed" }),
    );
    expect(badDecision).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(repo.respondToBooking).not.toHaveBeenCalled();
  });

  it("converts the final price to paise", async () => {
    await actions.respondToBookingAction(
      null,
      form({ bookingId: ID, decision: "confirmed", finalTotalRupees: "3600", note: "" }),
    );
    expect(repo.respondToBooking).toHaveBeenCalledWith(ID, "confirmed", 360_000, "");
  });
});

describe("slot actions", () => {
  it("rejects past dates with a clear field error", async () => {
    const result = await actions.addSlotAction(
      null,
      form({ experienceId: ID, startsOn: "2020-01-01", startTime: "", capacity: "5" }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { fieldErrors: { startsOn: ["Choose today or a future date."] } },
    });
    expect(repo.createSlot).not.toHaveBeenCalled();
  });

  it("passes ownership failures through", async () => {
    repo.updateSlot.mockRejectedValue(new AppError("NOT_FOUND", "We couldn't find that date."));
    expect(
      await actions.setSlotStatusAction(null, form({ slotId: ID, status: "closed" })),
    ).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
