import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { getSupportEmail } from "@/lib/env";

export const LEGAL_UPDATED = "15 October 2026";

/** Shared frame for the privacy policy and terms: readable prose, date and contact. */
export function LegalPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  const support = getSupportEmail();
  return (
    <PageShell title={title} description={`Last updated ${LEGAL_UPDATED}. ${summary}`}>
      <article className="flex max-w-3xl flex-col gap-6 leading-7 text-fg-soft [&_h2]:mt-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-fg [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
        <section aria-labelledby="contact-heading" className="flex flex-col gap-2">
          <h2 id="contact-heading">Contact</h2>
          <p>
            {support ? (
              <>
                Questions or requests:{" "}
                <a
                  href={`mailto:${support}`}
                  className="font-medium text-accent underline underline-offset-4"
                >
                  {support}
                </a>
                .
              </>
            ) : (
              "Questions or requests: contact the Himverse team through the partner or support details given with your booking."
            )}{" "}
            See also our{" "}
            <Link href="/privacy" className="text-accent underline underline-offset-4">
              privacy policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="text-accent underline underline-offset-4">
              terms of use
            </Link>
            .
          </p>
        </section>
      </article>
    </PageShell>
  );
}
