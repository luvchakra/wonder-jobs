/**
 * The one frame every WonderWorks email goes through, as quiet as the landing page (owner, 2026-11-07: "make it simple
 * like landing page"): the mark and the WonderWorks name at the top, the email's own content in one plain column, and
 * a small footer saying why the person got it. No coloured bar, no card. Table layout with inline styles only (Gmail,
 * Outlook and Apple Mail drop stylesheets, flexbox, SVG and data: images), max 560px wide, a hidden preheader, and a
 * plain-text twin of everything.
 *
 * The name is live text, not part of an image (owner, 2026-11-07: "can't see the text"): a mail app in dark mode
 * recolours text but not pictures, and the old wordmark PNG's dark "Wonder" vanished on a dark background. The mark
 * is a colour icon that reads on both.
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

/** The WonderWorks mark (transparent PNG, 512×512), shown at 28px beside the name. */
export const EMAIL_LOGO_PATH = "/brand/wonderstar-mark-square.png";
const MARK = 28;

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
  /**
   * Sent for a company (career-site applications): its name heads the email in place of the WonderJobs logo,
   * and the footer says WonderJobs handles the application for it.
   */
  brand?: { name: string; home: string };
}

export function emailLogoUrl(origin: string): string {
  return new URL(EMAIL_LOGO_PATH, origin).toString();
}

/** Wraps an email's content in the brand frame; returns the HTML and its plain-text alternative. */
export function renderEmailLayout(input: EmailLayoutInput): { html: string; text: string } {
  const C = EMAIL_COLORS;
  const abs = (href: string) => new URL(href, input.origin).toString();
  const links: EmailLink[] = [
    ...(input.settingsLink === false ? [] : [{ label: "Notification settings", href: "/app/settings/notifications" }]),
    { label: "Privacy", href: "/privacy" },
    ...(input.links ?? []),
  ].map((l) => ({ label: l.label, href: abs(l.href) }));
  const home = input.brand ? abs(input.brand.home) : abs("/");
  const sender = input.brand ? `${input.brand.name} · applications handled by WonderWorks` : "WonderWorks";
  const header = input.brand
    ? `<a href="${escapeHtml(home)}" style="text-decoration:none;font-size:20px;font-weight:700;color:${C.ink}">${escapeHtml(input.brand.name)}</a>`
    : `<a href="${escapeHtml(home)}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="vertical-align:middle;padding-right:8px"><img src="${escapeHtml(emailLogoUrl(input.origin))}" width="${MARK}" height="${MARK}" alt="" style="display:block;border:0;outline:none;height:${MARK}px;width:${MARK}px"></td><td style="vertical-align:middle;font-size:20px;font-weight:700;letter-spacing:-0.2px;color:${C.ink}">Wonder<span style="color:${C.brand500}">Works</span></td></tr></table></a>`;

  const linkHtml = links.map((l) => `<a href="${escapeHtml(l.href)}" style="color:${C.muted};text-decoration:underline">${escapeHtml(l.label)}</a>`).join(` &nbsp;·&nbsp; `);
  // Pads the preview so mail apps don't pull body text in after the preheader.
  const previewPad = "&#8203;&nbsp;".repeat(60);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(input.brand?.name ?? "WonderWorks")}</title></head>
<body style="margin:0;padding:0;background:${C.surface};font-family:${EMAIL_FONT};color:${C.ink};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.surface}">${escapeHtml(input.preheader)}${previewPad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.surface}" style="background:${C.surface}"><tr><td align="center" style="padding:32px 20px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td style="padding:0 0 28px">
${header}
</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:${C.ink}">
${input.bodyHtml}
</td></tr>
<tr><td style="padding:32px 0 0"><div style="border-top:1px solid ${C.line};padding-top:16px;font-size:12px;line-height:1.6;color:${C.muted}">
<div style="margin:0 0 6px">${escapeHtml(input.reason)}</div>
<div>${linkHtml}</div>
${input.brand ? `<div style="margin-top:6px">${escapeHtml(sender)}</div>` : ""}
</div></td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [input.bodyText.trim(), "", "—", sender, input.reason, ...links.map((l) => `${l.label}: ${l.href}`)].join("\n");
  return { html, text };
}
