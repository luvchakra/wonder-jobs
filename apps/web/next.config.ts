import type { NextConfig } from "next";

/**
 * Security headers on every response (OWASP Secure Headers).
 *
 * The CSP pins where scripts, styles, images and connections may come from. `script-src` still
 * allows inline scripts: Next.js inlines its hydration data and the app layout inlines its early
 * state fetch, and nonces would force every page to render dynamically. What it does stop is
 * loading or exfiltrating to any origin not listed here, framing by other sites, plugins, and
 * `<base>` / form hijacking. Payments open Razorpay's / Stripe's own pages by navigation, so their
 * domains need no allowance here.
 */
function contentSecurityPolicy(): string {
  const dev = process.env.NODE_ENV !== "production";
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  let supabaseOrigins: string[] = [];
  try {
    if (supabase) {
      const u = new URL(supabase);
      supabaseOrigins = [u.origin, `wss://${u.host}`];
    }
  } catch {
    supabaseOrigins = [];
  }
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Vercel's preview toolbar (vercel.live) only appears on preview deployments.
    "script-src": ["'self'", "'unsafe-inline'", "https://vercel.live", ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'", "https://vercel.live"],
    "img-src": ["'self'", "data:", "blob:", "https://vercel.live", "https://vercel.com"],
    "font-src": ["'self'", "data:", "https://vercel.live", "https://assets.vercel.com"],
    "connect-src": ["'self'", ...supabaseOrigins, "https://vercel.live", "wss://ws-us3.pusher.com", ...(dev ? ["ws:", "http://localhost:*"] : [])],
    "frame-src": ["https://vercel.live"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const csp = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  // Only on Vercel, which always serves HTTPS: a local `next start` (and the E2E suite) runs on plain http.
  if (process.env.VERCEL) csp.push("upgrade-insecure-requests");
  return csp.join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The microphone is used for dictation on our own pages only; nothing else is ever requested.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()" },
  // allow-popups: the apply flow keeps a handle on the employer tab it opened, so a candidate's half-filled
  // form is reused rather than reloaded; plain same-origin would sever that handle.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Auto-memoizes components and hooks so re-renders stay cheap without hand-written memo.
  reactCompiler: true,
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  // Types are checked once per change, by CI's Typecheck job (`next typegen` + `tsc`, the same route
  // types `next build` would check), which must pass before a PR merges. On CI and Vercel the build's
  // own TypeScript pass repeated that work (17 s in CI, up to 26 s of a production deploy). Local
  // builds still check.
  typescript: { ignoreBuildErrors: Boolean(process.env.CI || process.env.VERCEL) },
  experimental: {
    // Keep visited product pages in the client router cache: back/forward and
    // repeat navigations render instantly instead of refetching the segment.
    staleTimes: { dynamic: 300, static: 300 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
