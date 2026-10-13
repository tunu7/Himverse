import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";

// Admin console: actions validate before reaching the server layer; the server
// layer requires admin and maps database errors to clear, safe messages.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

const session = { requireAdmin: vi.fn() };
vi.mock("@/server/auth/session", () => ({
  requireAdmin: () => session.requireAdmin(),
}));

type Result = { data: unknown; error: { code?: string; message: string } | null };
let nextResult: Result = { data: [{ id: "x" }], error: null };
const calls: Array<{ table: string; op: string; payload?: unknown; eq?: [string, unknown] }> = [];
function builder(table: string) {
  const call: (typeof calls)[number] = { table, op: "select" };
  calls.push(call);
  const b = {
    insert: (payload: unknown) => ((call.op = "insert"), (call.payload = payload), b),
    update: (payload: unknown) => ((call.op = "update"), (call.payload = payload), b),
    delete: () => ((call.op = "delete"), b),
    eq: (col: string, val: unknown) => ((call.eq = [col, val]), b),
    select: () => b,
    then: (resolve: (r: Result) => unknown) => resolve(nextResult),
  };
  return b;
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: builder }),
}));

const admin = await import("@/server/admin/admin");
const { saveDestinationAction, moderateExperienceAction, deleteDestinationAction } =
  await import("@/features/admin/actions");

const ID = "5eed0000-0000-4000-8000-000000000001";
function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.append(k, v);
  return data;
}
const destination = {
  slug: "  Ziro ",
  name: "Ziro Valley",
  district: "Lower Subansiri",
  summary: "Valley",
  description: "",
};

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: [{ id: "x" }], error: null };
  session.requireAdmin.mockReset().mockResolvedValue({ id: "admin", email: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("admin destination actions", () => {
  it("creates a destination with a normalised slug and an unchecked publish box", async () => {
    const result = await saveDestinationAction(null, form(destination));
    expect(result).toEqual({ ok: true, data: { done: true } });
    expect(calls[0]).toMatchObject({
      table: "destinations",
      op: "insert",
      payload: { slug: "ziro", name: "Ziro Valley", is_published: false },
    });
  });

  it("updates by id when one is given, publishing when the box is checked", async () => {
    await saveDestinationAction(null, form({ ...destination, id: ID, isPublished: "on" }));
    expect(calls[0]).toMatchObject({
      op: "update",
      eq: ["id", ID],
      payload: { is_published: true },
    });
  });

  it("rejects invalid slugs and unknown fields before touching the database", async () => {
    const bad = await saveDestinationAction(null, form({ ...destination, slug: "Ziro Valley!" }));
    expect(bad).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    const extra = await saveDestinationAction(null, form({ ...destination, created_by: ID }));
    expect(extra).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(calls).toHaveLength(0);
  });

  it("refuses non-admins", async () => {
    session.requireAdmin.mockRejectedValue(new AppError("FORBIDDEN", "No."));
    const result = await saveDestinationAction(null, form(destination));
    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(calls).toHaveLength(0);
  });

  it("explains a duplicate slug on the slug field", async () => {
    nextResult = { data: null, error: { code: "23505", message: "duplicate" } };
    const result = await saveDestinationAction(null, form(destination));
    expect(result).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", fieldErrors: { slug: ["Already in use."] } },
    });
  });

  it("explains why a destination with experiences can't be deleted", async () => {
    nextResult = { data: null, error: { code: "23503", message: "fk" } };
    const result = await deleteDestinationAction(null, form({ id: ID }));
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    if (result && !result.ok) expect(result.error.message).toMatch(/still has experiences/);
  });
});

describe("experience moderation", () => {
  it.each([
    ["unpublish", "draft"],
    ["archive", "archived"],
    ["publish", "published"],
  ] as const)("%s sets status %s", async (action, status) => {
    await admin.moderateExperience(ID, action);
    expect(calls[0]).toMatchObject({ table: "experiences", op: "update", payload: { status } });
  });

  it("rejects unknown actions in the form", async () => {
    const result = await moderateExperienceAction(
      null,
      form({ experienceId: ID, action: "delete" }),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(calls).toHaveLength(0);
  });

  it("explains when publishing is blocked by the provider or destination state", async () => {
    nextResult = { data: null, error: { code: "42501", message: "policy" } };
    await expect(admin.moderateExperience(ID, "publish")).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/provider is verified/),
    });
  });

  it("treats a missing experience as not found", async () => {
    nextResult = { data: [], error: null };
    await expect(admin.moderateExperience(ID, "archive")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(admin.moderateExperience("not-a-uuid", "archive")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
