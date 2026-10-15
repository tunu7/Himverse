import { PortalShell } from "@/features/portal/components/portal-shell";

const PARTNER_LINKS = [
  { href: "/provider", label: "Overview", exact: true },
  { href: "/provider/bookings", label: "Booking requests" },
  { href: "/provider/listings", label: "Listings" },
  { href: "/provider/business", label: "Business profile" },
  { href: "/provider/account", label: "Account" },
] as const;

/** Tourism-partner portal: application, experiences, dates and booking requests. */
export default function ProviderLayout({ children }: LayoutProps<"/provider">) {
  return (
    <PortalShell area="partner" links={PARTNER_LINKS}>
      {children}
    </PortalShell>
  );
}
