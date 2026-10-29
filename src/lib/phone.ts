/**
 * Mobile numbers for phone sign-in (ADR-0011): a short list of countries our
 * travellers come from, each with its calling code and mobile-number pattern,
 * so we only ask Supabase to text numbers that can receive an SMS. Shared by
 * the form (client) and the server schemas. No third-party phone library: the
 * list is small and the SMS provider validates delivery anyway.
 */
export const PHONE_COUNTRIES = [
  { code: "IN", name: "India", dial: "91", mobile: /^[6-9]\d{9}$/ },
  { code: "NP", name: "Nepal", dial: "977", mobile: /^9[78]\d{8}$/ },
  { code: "BT", name: "Bhutan", dial: "975", mobile: /^1[67]\d{6}$/ },
  { code: "BD", name: "Bangladesh", dial: "880", mobile: /^1[3-9]\d{8}$/ },
  { code: "US", name: "United States / Canada", dial: "1", mobile: /^[2-9]\d{2}[2-9]\d{6}$/ },
  { code: "GB", name: "United Kingdom", dial: "44", mobile: /^7\d{9}$/ },
  { code: "AU", name: "Australia", dial: "61", mobile: /^4\d{8}$/ },
  { code: "SG", name: "Singapore", dial: "65", mobile: /^[89]\d{7}$/ },
  { code: "AE", name: "United Arab Emirates", dial: "971", mobile: /^5\d{8}$/ },
  { code: "DE", name: "Germany", dial: "49", mobile: /^1[5-7]\d{8,9}$/ },
  { code: "FR", name: "France", dial: "33", mobile: /^[67]\d{8}$/ },
] as const;

export type PhoneCountryCode = (typeof PHONE_COUNTRIES)[number]["code"];

export const PHONE_COUNTRY_CODES = PHONE_COUNTRIES.map((c) => c.code) as [
  PhoneCountryCode,
  ...PhoneCountryCode[],
];

export const DEFAULT_PHONE_COUNTRY: PhoneCountryCode = "IN";

/** International format: "+" and 8 to 15 digits. What Supabase Auth stores. */
export const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * The international (E.164) form of a mobile number typed in national form,
 * or null if it isn't a mobile number for that country. Spaces, dashes,
 * brackets, a leading trunk "0" and a repeated country code are tolerated.
 */
export function toE164(country: PhoneCountryCode, typed: string): string | null {
  const entry = PHONE_COUNTRIES.find((c) => c.code === country);
  if (!entry) return null;
  let digits = typed.replace(/[\s().-]/g, "");
  if (digits.startsWith("+")) {
    if (!digits.startsWith(`+${entry.dial}`)) return null;
    digits = digits.slice(entry.dial.length + 1);
  } else if (digits.startsWith("00")) {
    if (!digits.startsWith(`00${entry.dial}`)) return null;
    digits = digits.slice(entry.dial.length + 2);
  }
  if (!/^\d+$/.test(digits)) return null;
  // A trunk prefix ("0" before a national number) is not dialled internationally.
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!entry.mobile.test(digits)) return null;
  const e164 = `+${entry.dial}${digits}`;
  return E164.test(e164) ? e164 : null;
}
