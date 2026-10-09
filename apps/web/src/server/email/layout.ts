/**
 * The one branded frame every WonderJobs email goes through: logo header, brand accent bar, the
 * email's own content on a white card, and a footer saying why the person got it. Table layout with
 * inline styles only (Gmail, Outlook and Apple Mail drop stylesheets, flexbox, SVG and data: images),
 * max 600px wide, a hidden preheader, and a plain-text twin of everything.
 */

/** The app's own tokens (globals.css `--wj-*`), copied because mail clients can't read CSS variables. */
export const EMAIL_COLORS = {
  brand50: "#f1efff",
  brand500: "#6d4cf5",
  brand600: "#5b3ae0",
  ink: "#14142b",
  ink2: "#3f4160",
  muted: "#6b6d8a",
  line: "#e6e7f2",
  bg: "#f6f6fb",
  surface: "#ffffff",
} as const;

/** `--wj-gradient-brand`; Outlook ignores gradients and shows `brand500` instead. */
export const EMAIL_GRADIENT = "linear-gradient(135deg,#6d4cf5 0%,#7c5cff 55%,#a66bff 100%)";
export const EMAIL_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** The wordmark PNG the app header uses (`components/brand/WonderLogo.tsx`), 527×96 — shown at 32px tall. */
export const EMAIL_LOGO_PATH = "/brand/wonderjobs-logo-light.png";
const LOGO_HEIGHT = 32;
const LOGO_WIDTH = Math.round((527 / 96) * LOGO_HEIGHT);

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export interface EmailLink {
  label: string;
  /** Absolute, or a path resolved against `origin`. */
  href: string;
}

export interface EmailLayoutInput {
  /** The site's absolute origin (`siteUrl().origin`); the logo and footer links are built from it. */
  origin: string;
  /** The inbox preview line, hidden in the body. Plain text. */
  preheader: string;
  /** The email's own content, already escaped. */
  bodyHtml: string;
  /** The same content as plain text. */
  bodyText: string;
  /** One line: why this person got this email. Plain text. */
  reason: string;
  /** Link to the account's notification settings. Off for emails those settings don't control. */
  settingsLink?: boolean;
  /** Extra footer links the email already has, e.g. its unsubscribe link. */
  links?: EmailLink[];
}

export function emailLogoUrl(origin: string): string {
  return new URL(EMAIL_LOGO_PATH, origin).toString();
}

/** Wraps an email's content in the brand frame; returns the HTML and its plain-text alternative. */
export function renderEmailLayout(input: EmailLayoutInput): { html: string; text: string } {
  const C = EMAIL_COLORS;
  const abs = (href: string) => new URL(href, input.origin).toString();
  const links: EmailLink[] = [
    ...(input.settingsLink === false ? [] : [{ label: "Notification settings", href: "/app/profile#notifications" }]),
    { label: "Privacy", href: "/privacy" },
    ...(input.links ?? []),
  ].map((l) => ({ label: l.label, href: abs(l.href) }));
  const home = abs("/");

  const linkHtml = links.map((l) => `<a href="${escapeHtml(l.href)}" style="color:${C.muted};text-decoration:underline">${escapeHtml(l.label)}</a>`).join(` &nbsp;·&nbsp; `);
  // Pads the preview so mail apps don't pull body text in after the preheader.
  const previewPad = "&#8203;&nbsp;".repeat(60);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>WonderJobs</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${EMAIL_FONT};color:${C.ink};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg}">${escapeHtml(input.preheader)}${previewPad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td bgcolor="${C.brand500}" style="background:${C.brand500};background-image:${EMAIL_GRADIENT};height:6px;line-height:6px;font-size:0;border-radius:16px 16px 0 0">&nbsp;</td></tr>
<tr><td bgcolor="${C.surface}" style="background:${C.surface};padding:22px 24px 18px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};border-bottom:1px solid ${C.line}">
<a href="${escapeHtml(home)}" style="text-decoration:none"><img src="${escapeHtml(emailLogoUrl(input.origin))}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="WonderJobs" style="display:block;border:0;outline:none;text-decoration:none;height:${LOGO_HEIGHT}px;width:${LOGO_WIDTH}px;font-size:20px;font-weight:700;color:${C.brand600}"></a>
</td></tr>
<tr><td bgcolor="${C.surface}" style="background:${C.surface};padding:20px 20px 24px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};border-bottom:1px solid ${C.line};border-radius:0 0 16px 16px;font-size:14px;line-height:1.5;color:${C.ink}">
${input.bodyHtml}
</td></tr>
<tr><td align="center" style="padding:20px 16px 8px;font-size:12px;line-height:1.6;color:${C.muted}">
<div style="font-size:13px;font-weight:700;color:${C.ink2};margin:0 0 4px">WonderJobs</div>
<div style="margin:0 0 8px">${escapeHtml(input.reason)}</div>
<div>${linkHtml}</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [input.bodyText.trim(), "", "—", "WonderJobs", input.reason, ...links.map((l) => `${l.label}: ${l.href}`)].join("\n");
  return { html, text };
}
