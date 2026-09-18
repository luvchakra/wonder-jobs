/**
 * Notifies operators when a landing-page contact message comes in. Recipients
 * come from `CONTACT_NOTIFY_EMAILS` (comma-separated); delivery goes through
 * Resend when `RESEND_API_KEY` is set. Without a key, the notification is
 * logged server-side instead of pretending to be delivered — same honesty
 * pattern as the rest of the app's optional integrations (WonderJobs AI,
 * Adzuna): say plainly what happened.
 */

export interface ContactNotifyPayload {
  name: string;
  email: string;
  topic: string;
  message: string;
  page?: string | null;
}

/** Splits, trims, dedupes and validates a comma-separated address list. Invalid entries are dropped, not thrown. */
export function parseEmailList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const addr = part.trim().toLowerCase();
    if (addr && EMAIL_RE.test(addr)) seen.add(addr);
  }
  return [...seen];
}

export interface NotifyResult {
  attempted: boolean;
  sent: boolean;
  recipients: string[];
  reason?: string;
}

/**
 * Best-effort notification. Never throws: a failure here must never fail the
 * person's contact submission, which is already safely stored (or logged).
 */
export async function notifyContactRecipients(payload: ContactNotifyPayload): Promise<NotifyResult> {
  const recipients = parseEmailList(process.env.CONTACT_NOTIFY_EMAILS);
  if (recipients.length === 0) return { attempted: false, sent: false, recipients: [] };

  const apiKey = process.env.RESEND_API_KEY;
  const subject = `[WonderJobs contact] ${payload.topic} — ${payload.name}`;
  const text = `${payload.name} <${payload.email}> wrote via ${payload.page ?? "the landing page"} (topic: ${payload.topic}):\n\n${payload.message}\n\nReply directly to ${payload.email}.`;

  if (!apiKey) {
    // No email provider configured: say so honestly instead of pretending to deliver.
    console.info("[contact] notification not sent (no RESEND_API_KEY configured)", { recipients, subject, preview: payload.message.slice(0, 200) });
    return { attempted: true, sent: false, recipients, reason: "no email provider configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM_EMAIL || "WonderJobs <onboarding@resend.dev>",
        to: recipients,
        reply_to: payload.email,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[contact] notification send failed", res.status, detail.slice(0, 300));
      return { attempted: true, sent: false, recipients, reason: `provider responded ${res.status}` };
    }
    return { attempted: true, sent: true, recipients };
  } catch (e) {
    console.error("[contact] notification send threw", e instanceof Error ? e.message : e);
    return { attempted: true, sent: false, recipients, reason: "network error" };
  }
}
