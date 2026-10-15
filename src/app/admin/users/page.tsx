import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { EmptyState, FilterTabs } from "@/components/dashboard";
import { inputClass, secondaryButtonClass } from "@/components/form-feedback";
import { LoadingBlock, PageShell } from "@/components/page-shell";
import { type AccountType, ADMIN_USERS_PAGE_SIZE, listUsersForAdmin } from "@/server/admin/admin";
import { requireAdminForPage } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Users · Admin · Himverse.AI",
  robots: { index: false },
};

const TYPES = {
  all: "All",
  traveller: "Travellers",
  partner: "Partners",
  admin: "Admins",
} as const;
type TypeKey = keyof typeof TYPES;

const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })
    : "—";

async function Users({ searchParams }: PageProps<"/admin/users">) {
  await requireAdminForPage("/admin/users");
  await connection();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const type: TypeKey =
    typeof params.type === "string" && params.type in TYPES ? (params.type as TypeKey) : "all";
  const rawPage = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 1000 ? rawPage : 1;
  const { users, total } = await listUsersForAdmin({
    query,
    accountType: type === "all" ? null : (type as AccountType),
    page,
  });
  const pages = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));
  const href = (changes: { type?: string; page?: number }) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    const t = changes.type ?? type;
    if (t !== "all") sp.set("type", t);
    const p = changes.page ?? 1;
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return `/admin/users${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <form className="flex flex-wrap gap-2" role="search" action="/admin/users">
        <label className="sr-only" htmlFor="user-search">
          Search by email or name
        </label>
        <input
          id="user-search"
          name="q"
          defaultValue={query}
          placeholder="Search by email or name"
          maxLength={100}
          className={`${inputClass} max-w-sm flex-1`}
        />
        {type !== "all" ? <input type="hidden" name="type" value={type} /> : null}
        <button type="submit" className={secondaryButtonClass}>
          Search
        </button>
      </form>
      <FilterTabs
        label="Account types"
        active={type}
        hrefFor={(key) => href({ type: key })}
        tabs={(Object.keys(TYPES) as TypeKey[]).map((key) => ({ key, label: TYPES[key] }))}
      />
      <p className="text-sm text-muted">
        {total} {total === 1 ? "account" : "accounts"}
      </p>
      {users.length === 0 ? (
        <EmptyState title="No accounts match" body="Try a different search or account type." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-line text-xs tracking-wide text-subtle uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Business</th>
                <th className="px-4 py-3 font-medium">Security</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id} data-testid="admin-user-row">
                  <td className="px-4 py-3">
                    <p className="font-medium text-fg">{u.displayName}</p>
                    <p className="text-muted">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">{u.accountType ?? "not set up"}</td>
                  <td className="px-4 py-3 text-muted">{u.businessNames ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    {u.emailConfirmed ? "Email confirmed" : "Email unconfirmed"}
                    {u.accountType === "partner" || u.accountType === "admin"
                      ? ` · ${u.twoStep ? "2-step on" : "2-step not set up"}`
                      : ""}
                  </td>
                  <td className="px-4 py-3 text-muted">{date(u.createdAt)}</td>
                  <td className="px-4 py-3 text-muted">{date(u.lastSignInAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={href({ page: page - 1 })}
              className="font-medium text-accent hover:underline"
            >
              ← Previous
            </Link>
          ) : null}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link
              href={href({ page: page + 1 })}
              className="font-medium text-accent hover:underline"
            >
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

export default function AdminUsersPage(props: PageProps<"/admin/users">) {
  return (
    <PageShell
      title="Users"
      description="Read-only. Roles are granted by the owner (see the runbook); two-step resets in the Supabase dashboard."
    >
      <Suspense fallback={<LoadingBlock label="Loading accounts…" variant="list" />}>
        <Users {...props} />
      </Suspense>
    </PageShell>
  );
}
