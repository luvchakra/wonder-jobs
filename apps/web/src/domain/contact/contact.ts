/**
 * Sharing phone and email between two people (owner, 2026-11-21: "safely share phone number and email with masking
 * option on by default and share only on mutual consent"). Each person offers what they choose; the other sees it only
 * masked (+9198•••••210, ku•••@gmail.com) until they offer theirs back. Then both see each other's in full. Either can
 * stop sharing at any time. The same rules in every module (Network, Co-founders, Buy, Sell & Rent).
 */
export interface ContactOffer {
  phone?: string;
  email?: string;
}

/** What one person sees of an exchange. */
export interface ContactView {
  /** What they offered, in full; null when they haven't. */
  mine: ContactOffer | null;
  /** What the other person offered: masked until both have offered, in full after; null when they haven't. */
  theirs: (ContactOffer & { masked: boolean }) | null;
}

const DOT = "•";

/** The start and end of a number, the rest hidden: enough to recognise it, not to call it. */
export function maskPhone(phone: string): string {
  const s = phone.replace(/[^\d+]/g, "");
  if (s.replace(/\D/g, "").length < 7) return DOT.repeat(6);
  const head = s.slice(0, s.startsWith("+") ? 5 : 2);
  const tail = s.slice(-3);
  return head + DOT.repeat(Math.max(3, s.length - head.length - tail.length)) + tail;
}

/** The first letters of the name and the whole domain: ku•••@gmail.com. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return DOT.repeat(6);
  const local = email.slice(0, at);
  return `${local.slice(0, local.length > 2 ? 2 : 1)}${DOT.repeat(3)}${email.slice(at)}`;
}

export const masked = (o: ContactOffer): ContactOffer => ({ ...(o.phone ? { phone: maskPhone(o.phone) } : {}), ...(o.email ? { email: maskEmail(o.email) } : {}) });

/** A phone number as people write it: 7 to 15 digits, with +, spaces, dashes, dots or brackets. */
export function cleanPhone(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  if (!t || t.length > 25 || !/^\+?[\d\s\-().]+$/.test(t)) return null;
  const digits = t.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15 ? t : null;
}

export function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return t.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? t : null;
}
