import { Suspense } from "react";

import { LoadingBlock } from "@/components/page-shell";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { PortalShell } from "@/features/portal/components/portal-shell";
import { isCurrentUserAdmin } from "@/server/auth/session";

const ADMIN_LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/destinations", label: "Destinations" },
  { href: "/admin/experiences", label: "Experiences" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/account", label: "Account" },
] as const;

/**
 * Admins get the console frame. Everyone else gets the normal site frame around
 * the pages' plain 404 (requireAdminForPage), so the console isn't revealed.
 */
async function AdminFrame({ children }: { children: React.ReactNode }) {
  if (await isCurrentUserAdmin()) {
    return (
      <PortalShell area="admin" links={ADMIN_LINKS}>
        {children}
      </PortalShell>
    );
  }
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
          <LoadingBlock label="Loading…" variant="cards" />
        </main>
      }
    >
      <AdminFrame>{children}</AdminFrame>
    </Suspense>
  );
}
