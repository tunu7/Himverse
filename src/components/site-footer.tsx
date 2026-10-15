import Link from "next/link";

import { BrandLogo } from "@/components/brand";

const COLUMNS = [
  {
    title: "Explore",
    links: [
      { href: "/destinations", label: "Destinations" },
      { href: "/experiences", label: "Experiences" },
      { href: "/itineraries/new", label: "Plan a trip" },
    ],
  },
  {
    title: "Partners",
    links: [
      { href: "/sign-up?as=partner", label: "List your experiences" },
      { href: "/provider", label: "Partner portal" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of use" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="flex max-w-sm flex-col gap-4">
          <Link href="/" className="group self-start text-fg">
            <BrandLogo />
          </Link>
          <p className="text-sm leading-6 text-muted">
            Trusted Himalayan experiences from verified local providers, starting in Arunachal
            Pradesh.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <div key={column.title} className="flex flex-col gap-3 text-sm">
            <p className="font-medium text-fg">{column.title}</p>
            <ul className="flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-muted transition-colors hover:text-fg">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-subtle sm:px-6">
          Himverse.AI · Prices are indicative until a provider confirms your booking.
        </p>
      </div>
    </footer>
  );
}
