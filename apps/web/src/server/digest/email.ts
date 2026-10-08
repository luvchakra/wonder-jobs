import type { Digest, DigestItem } from "@/domain/digest/build";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The digest as an email: HTML with inline styles (mail clients drop stylesheets) and a plain-text twin. */
export function renderDigestEmail(d: Digest, opts: { origin: string; name?: string; unsubscribeUrl: string }): { subject: string; html: string; text: string } {
  const abs = (href?: string) => (href ? new URL(href, opts.origin).toString() : undefined);
  const sections: [string, DigestItem[]][] = [
    ["Heads up", d.headsUp],
    ["What happened", d.keyDetails],
    ["Waiting on you", d.dependencies],
    ["Going well", d.goingWell],
    ["Needs improvement", d.needsImprovement],
    ["Suggestions", d.suggestions],
  ];
  const item = (i: DigestItem) => {
    const label = i.origin === "ai" ? ' <span style="color:#7c3aed;font-size:12px">· Suggested by AI</span>' : "";
    const body = i.href ? `<a href="${esc(abs(i.href)!)}" style="color:#111827;text-decoration:underline">${esc(i.text)}</a>` : esc(i.text);
    return `<li style="margin:0 0 6px">${body}${label}</li>`;
  };
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<p style="font-size:13px;color:#6b7280;margin:0 0 4px">WonderJobs</p>
<h1 style="font-size:20px;margin:0 0 16px">${esc(opts.name ? `Hi ${opts.name}, here's your update` : "Here's your update")}</h1>
<p style="margin:0 0 20px"><a href="${esc(abs(d.cta.href)!)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600">${esc(d.cta.label)}</a></p>
${sections
  .filter(([, items]) => items.length)
  .map(([title, items]) => `<h2 style="font-size:15px;margin:20px 0 8px">${esc(title)}</h2><ul style="padding-left:18px;margin:0;font-size:14px;line-height:1.5">${items.map(item).join("")}</ul>`)
  .join("\n")}
<p style="font-size:12px;color:#6b7280;margin:28px 0 0">Every number here comes from your own WonderJobs account. You get this when there's been activity, at most once a day. <a href="${esc(opts.unsubscribeUrl)}" style="color:#6b7280">Stop these emails</a>.</p>
</div></body></html>`;
  const text = [
    opts.name ? `Hi ${opts.name}, here's your WonderJobs update.` : "Here's your WonderJobs update.",
    "",
    `${d.cta.label}: ${abs(d.cta.href)}`,
    ...sections.filter(([, items]) => items.length).flatMap(([title, items]) => ["", title.toUpperCase(), ...items.map((i) => `- ${i.text}${i.origin === "ai" ? " (suggested by AI)" : ""}${i.href ? ` ${abs(i.href)}` : ""}`)]),
    "",
    "Every number here comes from your own WonderJobs account. You get this when there's been activity, at most once a day.",
    `Stop these emails: ${opts.unsubscribeUrl}`,
  ].join("\n");
  return { subject: d.subject, html, text };
}
