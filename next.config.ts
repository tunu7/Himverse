import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy without nonces (docs/security/SECURITY.md).
 *
 * Nonces require dynamic rendering of every page, which would discard the
 * prerendered static shells (Cache Components). Next.js bootstrap scripts are
 * inline, so script-src keeps 'unsafe-inline'; everything else is locked down.
 * The browser never calls Supabase or the AI provider directly (all data access
 * is server-side), so connect-src is 'self'.
 *
 * No upgrade-insecure-requests: every source is already 'self' and HSTS forces
 * HTTPS on deployments, while on plain-HTTP production builds (next start, E2E)
 * the directive upgrades in-page redirects (e.g. prefetching a protected link
 * that redirects to /sign-in) to an https URL that fails.
 */
function contentSecurityPolicy(razorpay: boolean): string {
  // Razorpay Checkout (ADR-0005 §9), only where a deposit is paid. Razorpay
  // publishes no official list; confirm in Test Mode that the console shows no
  // CSP violations before going live.
  const rzp = razorpay ? " https://checkout.razorpay.com" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${rzp}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:" + (razorpay ? " https://*.razorpay.com" : ""),
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws:" : ""}` +
      (razorpay ? " https://api.razorpay.com https://lumberjack.razorpay.com" : ""),
    ...(razorpay ? ["frame-src https://api.razorpay.com https://checkout.razorpay.com"] : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy(false) },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The traveller's booking page opens Razorpay Checkout: its script and
      // frame, and bank/UPI popups that need their opener (later rules win).
      {
        source: "/bookings/:id",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy(true) },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(self)",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // /explore was the Phase 1 public listing; discovery now lives at /experiences.
      { source: "/explore", destination: "/experiences", permanent: true },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
