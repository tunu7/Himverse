import { cardClass } from "@/components/form-feedback";
import { ChangePasswordForm } from "@/features/auth/components/password-forms";
import { reauthMethodFor } from "@/server/auth/account-deletion";
import { getAssurance } from "@/server/auth/assurance";
import { hasPasswordSignIn } from "@/server/auth/passwords";
import type { AccountType } from "@/server/auth/session";
import { getMyProfile } from "@/server/profiles/profiles";

import { DeleteAccountForm } from "./delete-account-form";
import { ProfileForm } from "./profile-form";

const TYPE_LABELS: Record<AccountType, string> = {
  traveller: "Traveller account",
  partner: "Partner account",
  admin: "Admin account",
};

/** Profile and sign-in settings, shared by every area's account page. */
export async function AccountSettings({ accountType }: { accountType: AccountType }) {
  const [profile, hasPassword, assurance, reauth] = await Promise.all([
    getMyProfile(),
    hasPasswordSignIn(),
    getAssurance(),
    reauthMethodFor(),
  ]);
  return (
    <>
      <section className={`${cardClass} flex flex-col gap-3 p-6`} aria-labelledby="profile-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="profile-heading" className="text-lg font-semibold text-fg">
            Profile
          </h2>
          <span
            className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-muted"
            data-testid="account-type"
          >
            {TYPE_LABELS[accountType]}
          </span>
        </div>
        <p className="text-muted">
          Signed in as <span className="font-medium text-fg">{profile.email}</span>
        </p>
        <ProfileForm displayName={profile.displayName} />
        <p className="text-xs text-subtle">
          Account ID: <code data-testid="account-id">{profile.id}</code>
        </p>
      </section>

      <section
        className={`${cardClass} flex flex-col gap-4 p-6`}
        aria-labelledby="security-heading"
      >
        <h2 id="security-heading" className="text-lg font-semibold text-fg">
          Sign-in and security
        </h2>
        {accountType !== "traveller" ? (
          <p className="text-sm text-fg-soft" data-testid="two-step-status">
            Two-step login:{" "}
            <span className="font-medium text-fg">
              {assurance?.hasVerifiedTotp ? "On (authenticator app)" : "Not set up"}
            </span>
            . Required for {accountType} accounts. Lost your phone? Contact Himverse support to
            reset it.
          </p>
        ) : null}
        {hasPassword ? (
          <ChangePasswordForm />
        ) : (
          <p className="text-sm text-muted">
            You sign in with Google, so there&apos;s no Himverse password to change.
          </p>
        )}
      </section>

      {accountType !== "admin" ? (
        <div className="lg:col-span-2">
          <DeleteAccountForm reauth={reauth} accountType={accountType} />
        </div>
      ) : null}
    </>
  );
}
