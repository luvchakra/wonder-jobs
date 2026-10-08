/**
 * Turns a raw Supabase Auth error message into short, plain language a candidate can act on, instead of
 * GoTrue's own technical wording. Shared by every screen that surfaces a Supabase Auth error (sign-in/up,
 * magic link, OAuth, the callback that completes a link) so the same failure never reads differently
 * depending on which screen it happened to surface on. Anything unrecognized passes through unchanged —
 * still visible, not silently swallowed.
 */
/** What a link opened in a different browser means for the candidate. */
export const OTHER_BROWSER = "This link opened in a different browser from the one you started in. If it was to confirm your email, that's done — sign in to continue.";

/** True for the error Supabase gives when an email link is opened in a different browser or app (PKCE). */
export function isOtherBrowserError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("code verifier") || m.includes("pkce");
}

export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match. Try again or use a magic link.";
  if (m.includes("email not confirmed")) return "Confirm your email first — check your inbox for the link we sent.";
  if (m.includes("already registered")) return "There's already an account for this email. Sign in instead.";
  if (m.includes("password should be")) return "Use at least 8 characters for your password.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Give it a minute and try again.";
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return "Google sign-in isn't switched on for this deployment yet. Use email and password, or a magic link.";
  // PKCE: the link was opened in another browser or app than the one that asked for it (often a mail app's own browser).
  if (m.includes("code verifier") || m.includes("pkce")) return OTHER_BROWSER;
  if (/expired|invalid/.test(m) && /(token|link|otp|code)/.test(m)) return "This link is no longer valid. Request a new one.";
  return message;
}
