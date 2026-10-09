import type { Digest, DigestItem } from "@/domain/digest/build";
import { EMAIL_COLORS, EMAIL_GRADIENT, escapeHtml as esc, renderEmailLayout } from "@/server/email/layout";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

const INK = EMAIL_COLORS.ink;
const MUTED = EMAIL_COLORS.muted;
const LINE = EMAIL_COLORS.line;
const BRAND = EMAIL_COLORS.brand600;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
 * The digest as an email, inside the shared branded frame (`server/email/layout.ts`): table layout with
 * inline styles, and a plain-text twin. Every tile, bar and card is drawn from the digest's own counts.
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
                `<a href="${esc(abs(m.href)!)}" style="display:block;text-decoration:none;color:${INK};padding:10px 0;${i ? `border-top:1px solid ${LINE};` : ""}"><div style="font-size:14px;font-weight:600">${esc(m.title)}</div><div style="font-size:13px;color:${MUTED}">${esc([m.company, m.location].filter(Boolean).join(" · "))} &nbsp;<span style="display:inline-block;background:${EMAIL_COLORS.brand50};color:${BRAND};border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600">Strong match</span></div></a>`,
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

  // The update's own hero: a gradient card (solid brand colour where a mail app drops gradients).
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="${EMAIL_COLORS.brand500}" style="background:${EMAIL_COLORS.brand500};background-image:${EMAIL_GRADIENT};border-radius:14px;padding:22px 20px;color:#ffffff">
<div style="font-size:13px;opacity:.85;margin:0 0 6px">${esc(period)}</div>
<div style="font-size:22px;font-weight:700;margin:0 0 16px">${esc(opts.name ? `Hi ${opts.name}, here's your update` : "Here's your update")}</div>
<a href="${esc(abs(d.cta.href)!)}" style="display:inline-block;background:#ffffff;color:${BRAND};text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600;font-size:14px">${esc(d.cta.label)} →</a>
</td></tr></table>
<div style="padding:12px 0 0">${tiles}</div>
${funnel}${matches}${sections}
<div style="font-size:12px;color:${MUTED};padding:16px 4px 0">Every number here comes from your own WonderJobs account.</div>`;

  const text = [
    opts.name ? `Hi ${opts.name}, here's your WonderJobs update (${period}).` : `Here's your WonderJobs update (${period}).`,
    "",
    `${d.cta.label}: ${abs(d.cta.href)}`,
    "",
    stages.map(([label, n]) => `${label}: ${n}`).join(" · "),
    ...(d.topMatches.length ? ["", "STRONG MATCHES WAITING FOR YOU", ...d.topMatches.map((m) => `- ${m.title} at ${m.company}${m.location ? ` (${m.location})` : ""} ${abs(m.href)}`)] : []),
    ...SECTIONS.filter((x) => d[x.key].length).flatMap((x) => ["", x.title.toUpperCase(), ...d[x.key].map((i) => `- ${i.text}${i.origin === "ai" ? " (suggested by AI)" : ""}${i.href ? ` ${abs(i.href)}` : ""}`)]),
    "",
    "Every number here comes from your own WonderJobs account.",
  ].join("\n");
  const preheader = [plural(s.strongMatches, "strong match", "strong matches"), `${s.applied} applied`, period].join(" · ");
  const mail = renderEmailLayout({
    origin: opts.origin,
    preheader,
    bodyHtml: body,
    bodyText: text,
    reason: "You get this activity digest when there's been activity on your WonderJobs account, at most once a day.",
    links: [{ label: "Stop these emails", href: opts.unsubscribeUrl }],
  });
  return { subject: d.subject, ...mail };
}

/** A white card, with an optional coloured left edge and tint. */
function card(inner: string, accent?: string, tint = "#ffffff"): string {
  const edge = accent ? `border-left:4px solid ${accent};` : "";
  return `<div style="background:${tint};border:1px solid ${LINE};${edge}border-radius:12px;padding:16px 18px;margin:8px 4px 0">${inner}</div>`;
}
