import type { Digest, DigestItem } from "@/domain/digest/build";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const BRAND = "#4f46e5";
const FONT = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

/** Each section's accent, icon and tint — the icon and title carry meaning, the colour only supports it. */
const SECTIONS: { key: keyof Pick<Digest, "headsUp" | "keyDetails" | "dependencies" | "goingWell" | "needsImprovement" | "suggestions">; title: string; icon: string; accent: string; tint: string }[] = [
  { key: "headsUp", title: "Heads up", icon: "⚠️", accent: "#d97706", tint: "#fffbeb" },
  { key: "keyDetails", title: "What happened", icon: "📋", accent: "#64748b", tint: "#ffffff" },
  { key: "dependencies", title: "Waiting on you", icon: "⏳", accent: BRAND, tint: "#ffffff" },
  { key: "goingWell", title: "Going well", icon: "✅", accent: "#16a34a", tint: "#f0fdf4" },
  { key: "needsImprovement", title: "Needs improvement", icon: "🔧", accent: "#dc2626", tint: "#fef2f2" },
  { key: "suggestions", title: "Suggestions", icon: "💡", accent: "#7c3aed", tint: "#ffffff" },
];

/**
 * The digest as an email: table layout with inline styles (mail clients drop stylesheets and flexbox), no
 * images or scripts, and a plain-text twin. Every tile, bar and card is drawn from the digest's own counts.
 */
export function renderDigestEmail(d: Digest, opts: { origin: string; name?: string; unsubscribeUrl: string }): { subject: string; html: string; text: string } {
  const abs = (href?: string) => (href ? new URL(href, opts.origin).toString() : undefined);
  const period = `${day(d.since)} – ${day(d.until)}`;
  const s = d.stats;

  const tile = (value: number, label: string) =>
    `<td width="25%" style="padding:4px"><div style="background:#fff;border:1px solid ${LINE};border-radius:12px;padding:14px 8px;text-align:center"><div style="font-size:26px;font-weight:700;color:${INK};line-height:1.1">${value}</div><div style="font-size:12px;color:${MUTED};margin-top:4px">${esc(label)}</div></div></td>`;
  const tiles = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr>${tile(s.searches, s.searches === 1 ? "Search" : "Searches")}${tile(s.reviewed, "Jobs reviewed")}${tile(s.strongMatches, "Strong matches")}${tile(s.applied, "Applied")}</tr></table>`;

  // The funnel: one hue, one bar per stage, width against the largest stage, each bar labelled with its count.
  const stages: [string, number][] = [
    ["Reviewed", s.reviewed],
    ["Strong matches", s.strongMatches],
    ["Saved", s.saved],
    ["Applied", s.applied],
    ["Interview", s.interviews],
    ["Offer", s.offers],
  ];
  const max = Math.max(...stages.map(([, n]) => n));
  const bar = ([label, n]: [string, number]) => {
    const pct = n ? Math.max(2, Math.round((n / max) * 100)) : 0;
    const fill = pct ? `<td width="${pct}%" style="background:${BRAND};height:12px;border-radius:0 4px 4px 0;font-size:0;line-height:0">&nbsp;</td>` : "";
    const rest = pct < 100 ? `<td style="font-size:0;line-height:0">&nbsp;</td>` : "";
    return `<tr><td width="110" style="font-size:13px;color:${MUTED};padding:5px 8px 5px 0;white-space:nowrap">${esc(label)}</td><td style="padding:5px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${fill}${rest}</tr></table></td><td width="40" style="font-size:13px;font-weight:600;color:${INK};text-align:right;padding:5px 0 5px 8px">${n}</td></tr>`;
  };
  const funnel = max
    ? card(`<div style="font-size:15px;font-weight:600;margin:0 0 8px">Your search, ${esc(period)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stages.map(bar).join("")}</table>`)
    : "";

  const matches = d.topMatches.length
    ? card(
        `<div style="font-size:15px;font-weight:600;margin:0 0 8px">⭐ Strong matches waiting for you</div>` +
          d.topMatches
            .map(
              (m, i) =>
                `<a href="${esc(abs(m.href)!)}" style="display:block;text-decoration:none;color:${INK};padding:10px 0;${i ? `border-top:1px solid ${LINE};` : ""}"><div style="font-size:14px;font-weight:600">${esc(m.title)}</div><div style="font-size:13px;color:${MUTED}">${esc([m.company, m.location].filter(Boolean).join(" · "))} &nbsp;<span style="display:inline-block;background:#eef2ff;color:${BRAND};border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600">Strong match</span></div></a>`,
            )
            .join(""),
      )
    : "";

  const item = (i: DigestItem) => {
    const label = i.origin === "ai" ? ` <span style="display:inline-block;background:#f5f3ff;color:#7c3aed;border-radius:999px;padding:0 6px;font-size:11px">Suggested by AI</span>` : "";
    const body = i.href ? `<a href="${esc(abs(i.href)!)}" style="color:${INK};text-decoration:underline">${esc(i.text)}</a>` : esc(i.text);
    return `<li style="margin:0 0 6px">${body}${label}</li>`;
  };
  const sections = SECTIONS.filter((x) => d[x.key].length)
    .map((x) =>
      card(
        `<div style="font-size:15px;font-weight:600;margin:0 0 8px">${x.icon} ${esc(x.title)}</div><ul style="padding-left:18px;margin:0;font-size:14px;line-height:1.5">${d[x.key].map(item).join("")}</ul>`,
        x.accent,
        x.tint,
      ),
    )
    .join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f3f4f6;font-family:${FONT};color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="background:${BRAND};background-image:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:16px;padding:24px 22px;color:#fff">
<div style="font-size:13px;opacity:.85;margin:0 0 6px">WonderJobs · ${esc(period)}</div>
<div style="font-size:22px;font-weight:700;margin:0 0 16px">${esc(opts.name ? `Hi ${opts.name}, here's your update` : "Here's your update")}</div>
<a href="${esc(abs(d.cta.href)!)}" style="display:inline-block;background:#fff;color:${BRAND};text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600;font-size:14px">${esc(d.cta.label)} →</a>
</td></tr>
<tr><td style="padding:12px 0 0">${tiles}</td></tr>
<tr><td>${funnel}${matches}${sections}</td></tr>
<tr><td style="font-size:12px;color:${MUTED};padding:16px 4px 0;line-height:1.5">Every number here comes from your own WonderJobs account. You get this when there's been activity, at most once a day. <a href="${esc(opts.unsubscribeUrl)}" style="color:${MUTED}">Stop these emails</a>.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    opts.name ? `Hi ${opts.name}, here's your WonderJobs update (${period}).` : `Here's your WonderJobs update (${period}).`,
    "",
    `${d.cta.label}: ${abs(d.cta.href)}`,
    "",
    stages.map(([label, n]) => `${label}: ${n}`).join(" · "),
    ...(d.topMatches.length ? ["", "STRONG MATCHES WAITING FOR YOU", ...d.topMatches.map((m) => `- ${m.title} at ${m.company}${m.location ? ` (${m.location})` : ""} ${abs(m.href)}`)] : []),
    ...SECTIONS.filter((x) => d[x.key].length).flatMap((x) => ["", x.title.toUpperCase(), ...d[x.key].map((i) => `- ${i.text}${i.origin === "ai" ? " (suggested by AI)" : ""}${i.href ? ` ${abs(i.href)}` : ""}`)]),
    "",
    "Every number here comes from your own WonderJobs account. You get this when there's been activity, at most once a day.",
    `Stop these emails: ${opts.unsubscribeUrl}`,
  ].join("\n");
  return { subject: d.subject, html, text };
}

/** A white card, with an optional coloured left edge and tint. */
function card(inner: string, accent?: string, tint = "#ffffff"): string {
  const edge = accent ? `border-left:4px solid ${accent};` : "";
  return `<div style="background:${tint};border:1px solid ${LINE};${edge}border-radius:12px;padding:16px 18px;margin:8px 4px 0">${inner}</div>`;
}
