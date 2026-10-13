import { Suspense } from "react";

import { AdminNavItems, AdminNavLinks } from "@/features/admin/components/admin-nav-links";
import { isCurrentUserAdmin } from "@/server/auth/session";

/** Section tabs, shown only to admins (non-admins get the pages' 404). */
async function AdminNav() {
  if (!(await isCurrentUserAdmin())) return null;
  return (
    <nav aria-label="Admin" className="border-b border-line bg-surface-muted/60">
      <div className="mx-auto flex w-full max-w-6xl items-end gap-6 overflow-x-auto px-4 pt-4 sm:px-6">
        <span className="shrink-0 pb-3 text-xs font-bold tracking-widest text-accent uppercase">
          Admin
        </span>
        <Suspense fallback={<AdminNavItems pathname={null} />}>
          <AdminNavLinks />
        </Suspense>
      </div>
    </nav>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <Suspense fallback={null}>
        <AdminNav />
      </Suspense>
      {children}
    </>
  );
}
