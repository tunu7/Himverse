/**
 * A small, dependency-free strength estimate for the sign-up and password
 * forms. Guidance only: the real rules are length (8–72, enforced by the
 * schemas and Supabase Auth) and Supabase's own checks. Penalises the
 * patterns people actually use: short, single character class, repeats,
 * sequences and very common passwords.
 */
export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string };

const COMMON = new Set([
  "password",
  "password1",
  "12345678",
  "123456789",
  "qwertyuiop",
  "iloveyou",
  "admin123",
  "welcome1",
  "himverse",
  "letmein1",
]);

const LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;

export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) return { score: 0, label: "" };
  const lower = password.toLowerCase();
  if (password.length < 8 || COMMON.has(lower)) return { score: 0, label: LABELS[0] };

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  let points = 0;
  if (password.length >= 10) points++;
  if (password.length >= 14) points++;
  if (classes >= 2) points++;
  if (classes >= 3) points++;
  if (/(.)\1{2,}/.test(password)) points--; // aaa
  if (/(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/.test(lower)) points--;
  if (new Set(password).size <= 4) points--;

  const score = Math.max(1, Math.min(4, points)) as PasswordStrength["score"];
  return { score, label: LABELS[score] };
}
