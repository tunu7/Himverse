import { FilterTabs } from "@/components/dashboard";

const AREAS = {
  overview: { label: "Overview", href: "/account" },
  trips: { label: "Trip plans", href: "/itineraries" },
  bookings: { label: "Bookings", href: "/bookings" },
  settings: { label: "Settings", href: "/account/settings" },
} as const;

/** The traveller's own area: one row of tabs shared by its pages. */
export function TravellerTabs({ active }: { active: keyof typeof AREAS }) {
  return (
    <FilterTabs
      label="Your account"
      active={active}
      hrefFor={(key) => AREAS[key as keyof typeof AREAS].href}
      tabs={(Object.keys(AREAS) as (keyof typeof AREAS)[]).map((key) => ({
        key,
        label: AREAS[key].label,
      }))}
    />
  );
}
