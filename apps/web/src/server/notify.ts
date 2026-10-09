/**
 * Notifies operators when a landing-page contact message comes in. Recipients come from
 * `CONTACT_NOTIFY_EMAILS` (comma-separated); delivery goes through the operator's own mailbox over
 * SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — e.g. GoDaddy's smtpout.secureserver.net
 * with connect@wonderapps.biz). Without SMTP settings the notification is logged server-side instead
 * of pretending to be delivered — same honesty pattern as the app's other optional integrations.
 */
import nodemailer from "nodemailer";
import { siteUrl } from "@/lib/siteUrl";
import { EMAIL_COLORS, escapeHtml, renderEmailLayout } from "@/server/email/layout";

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

/** The operator's copy of a contact message, in the branded frame. Every visitor-supplied value is escaped. */
export function renderContactEmail(payload: ContactNotifyPayload, origin: string): { subject: string; html: string; text: string } {
  const C = EMAIL_COLORS;
  const where = payload.page ?? "the landing page";
  const row = (label: string, value: string) => `<tr><td width="70" style="padding:3px 12px 3px 0;color:${C.muted};font-size:13px;vertical-align:top">${label}</td><td style="padding:3px 0;font-size:14px;color:${C.ink}">${value}</td></tr>`;
  const bodyHtml = `<div style="font-size:18px;font-weight:700;margin:0 0 12px">New contact message</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px">${row("From", `${escapeHtml(payload.name)} &lt;<a href="mailto:${escapeHtml(payload.email)}" style="color:${C.brand600}">${escapeHtml(payload.email)}</a>&gt;`)}${row("Topic", escapeHtml(payload.topic))}${row("Page", escapeHtml(where))}</table>
<div style="background:${C.bg};border:1px solid ${C.line};border-left:4px solid ${C.brand500};border-radius:10px;padding:14px 16px;font-size:14px;line-height:1.55;white-space:pre-wrap">${escapeHtml(payload.message).replace(/\r?\n/g, "<br>")}</div>
<div style="font-size:13px;color:${C.muted};margin:14px 0 0">Reply to this email to answer ${escapeHtml(payload.email)}.</div>`;
  const bodyText = `${payload.name} <${payload.email}> wrote via ${where} (topic: ${payload.topic}):\n\n${payload.message}\n\nReply to this email to answer ${payload.email}.`;
  const mail = renderEmailLayout({
    origin,
    preheader: `${payload.topic} — ${payload.name}`,
    bodyHtml,
    bodyText,
    reason: "You're getting this because this address is set to receive WonderJobs contact-form messages.",
    // These recipients come from the server's settings, not an account's notification settings.
    settingsLink: false,
  });
  return { subject: `[WonderJobs contact] ${payload.topic} — ${payload.name}`, ...mail };
}

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
    const mail = renderContactEmail(payload, siteUrl().origin);
    await transport.sendMail({ from: smtp.from, to: recipients, replyTo: payload.email, subject: mail.subject, text: mail.text, html: mail.html });
    return { attempted: true, sent: true, recipients };
  } catch (e) {
    // The provider's error (e.g. "535 Authentication failed") says what to fix; it never contains the password.
    console.error("[contact] notification send failed", e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300));
    return { attempted: true, sent: false, recipients, reason: "send failed" };
  } finally {
    transport.close();
  }
}

export interface MailMessage {
  to: string;
  subject: string;
  /** Built with `renderEmailLayout` (server/email/layout.ts), so every email carries the brand frame. */
  html?: string;
  text: string;
  headers?: Record<string, string>;
}

/**
 * Sends one email through the same mailbox as the contact notifications. Never throws; without SMTP
 * settings nothing is sent and the result says so.
 */
export async function sendMail(msg: MailMessage, env: Env = process.env): Promise<{ sent: boolean; reason?: string }> {
  const smtp = smtpConfig(env);
  if (!smtp) return { sent: false, reason: "no email provider configured" };
  const secure = smtp.port === 465;
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure,
    requireTLS: !secure && !LOOPBACK.has(smtp.host),
    ignoreTLS: !secure && LOOPBACK.has(smtp.host),
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
  });
  try {
    await transport.sendMail({ from: smtp.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, headers: msg.headers });
    return { sent: true };
  } catch (e) {
    console.error("[mail] send failed", e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300));
    return { sent: false, reason: "send failed" };
  } finally {
    transport.close();
  }
}
