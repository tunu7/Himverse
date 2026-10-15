import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/features/legal/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Himverse.AI collects, why, who it is shared with, and your choices.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      summary="How Himverse.AI handles your personal data, in plain words."
    >
      <section className="flex flex-col gap-2">
        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Your account:</strong> email address, display name, account type (traveller or
            partner), how you sign in (password or Google) and whether two-step login is on. We
            never see your password or your authenticator codes in plain text.
          </li>
          <li>
            <strong>Booking requests:</strong> the listing, dates, number of travellers, rooms or
            vehicles, the contact phone number and message you give, and the booking&apos;s history.
          </li>
          <li>
            <strong>Trip plans:</strong> your trip preferences and notes, and the itineraries
            generated for you.
          </li>
          <li>
            <strong>Partners:</strong> business name, description, legal name and business contact
            details given in the partner application.
          </li>
          <li>
            <strong>Technical data:</strong> security and error logs (for example failed sign-in
            attempts and server errors) with your account ID, not your name or phone number.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2>Why we use it</h2>
        <ul>
          <li>To run your account and keep it secure, including limits on repeated attempts.</li>
          <li>To send your booking requests to the partner and show you their replies.</li>
          <li>To plan and save itineraries you ask for.</li>
          <li>To verify partners and keep listings trustworthy.</li>
        </ul>
        <p>We don&apos;t sell your data and we don&apos;t show advertising.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2>Who sees it</h2>
        <ul>
          <li>
            <strong>The partner of a booking</strong> sees your name, contact phone, party size and
            message for that booking only.
          </li>
          <li>
            <strong>Himverse administrators</strong> can see accounts and bookings to verify
            partners and resolve problems.
          </li>
          <li>
            <strong>Service providers</strong> that run the platform for us: Supabase (database and
            sign-in, hosted in Mumbai, India), Vercel (website hosting), our AI model provider
            (receives your trip preferences and notes to plan a trip, never your name, email or
            phone), Google (only if you sign in with Google) and Sentry (error reports).
          </li>
        </ul>
        <p>
          Please don&apos;t put personal details such as names or phone numbers in trip notes: they
          are sent to the AI model provider.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2>Cookies</h2>
        <p>
          We use only the cookies needed to keep you signed in. There are no analytics or
          advertising cookies.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2>How long we keep it, and your choices</h2>
        <ul>
          <li>You can change your name in your account settings at any time.</li>
          <li>
            You can <strong>delete your account</strong> yourself from your account settings. Your
            sign-in, profile and itineraries are deleted. Open booking requests and upcoming
            bookings are cancelled, and partners keep a record of past bookings without your name,
            phone number, messages or pickup details. Our hosting providers&apos; security logs may
            keep your email and IP address for a short time afterwards.
          </li>
          <li>
            Until you delete your account, booking records (including the contact phone you gave)
            are kept so you and the partner can refer to them.
          </li>
        </ul>
        <p>
          Himverse.AI is not intended for children under 18. Read how bookings work in our{" "}
          <Link href="/terms" className="text-accent underline underline-offset-4">
            terms of use
          </Link>
          .
        </p>
      </section>
    </LegalPage>
  );
}
