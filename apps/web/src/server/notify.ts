/**
 * Notifies operators when a landing-page contact message comes in. Recipients come from
 * `CONTACT_NOTIFY_EMAILS` (comma-separated); delivery goes through the operator's own mailbox over
 * SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — e.g. GoDaddy's smtpout.secureserver.net
 * with connect@wonderapps.biz). Without SMTP settings the notification is logged server-side instead
 * of pretending to be delivered — same honesty pattern as the app's other optional integrations.
 */
import nodemailer from "nodemailer";

/** The environment variables read here (process.env in the app; a plain object in tests). */
type Env = Record<string, string | undefined>;

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

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** The From header: the mailbox itself, named WonderJobs, unless `CONTACT_FROM_EMAIL` says otherwise. */
  from: string;
}

/** SMTP settings from the environment, or null when any required one is missing. */
export function smtpConfig(env: Env = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(env.SMTP_PORT?.trim() || 465);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  // Mailbox providers such as GoDaddy only send as the signed-in mailbox, so that is the default sender.
  return { host, port, user, pass, from: env.CONTACT_FROM_EMAIL?.trim() || `WonderJobs <${user}>` };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Best-effort notification. Never throws: a failure here must never fail the person's contact
 * submission, which is already safely stored (or logged).
 */
export async function notifyContactRecipients(payload: ContactNotifyPayload, env: Env = process.env): Promise<NotifyResult> {
  const recipients = parseEmailList(env.CONTACT_NOTIFY_EMAILS);
  if (recipients.length === 0) return { attempted: false, sent: false, recipients: [] };

  const smtp = smtpConfig(env);
  if (!smtp) {
    // No mailbox configured: say so honestly instead of pretending to deliver.
    // Recipients are the operator's own addresses; the sender's name, address and message stay out of the logs.
    console.info("[contact] notification not sent (SMTP_HOST, SMTP_USER and SMTP_PASS not all set)", { recipients: recipients.length, topic: payload.topic });
    return { attempted: true, sent: false, recipients, reason: "no email provider configured" };
  }

  const secure = smtp.port === 465;
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure,
    // Never send the mailbox password in the clear: anything other than implicit TLS must upgrade with
    // STARTTLS. Only a loopback server (local testing) may skip it.
    requireTLS: !secure && !LOOPBACK.has(smtp.host),
    ignoreTLS: !secure && LOOPBACK.has(smtp.host),
    auth: { user: smtp.user, pass: smtp.pass },
    // A contact submission waits on this; give up quickly rather than hold the request.
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 10_000,
  });

  try {
    await transport.sendMail({
      from: smtp.from,
      to: recipients,
      replyTo: payload.email,
      subject: `[WonderJobs contact] ${payload.topic} — ${payload.name}`,
      text: `${payload.name} <${payload.email}> wrote via ${payload.page ?? "the landing page"} (topic: ${payload.topic}):\n\n${payload.message}\n\nReply to this email to answer ${payload.email}.`,
    });
    return { attempted: true, sent: true, recipients };
  } catch (e) {
    // The provider's error (e.g. "535 Authentication failed") says what to fix; it never contains the password.
    console.error("[contact] notification send failed", e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300));
    return { attempted: true, sent: false, recipients, reason: "send failed" };
  } finally {
    transport.close();
  }
}
