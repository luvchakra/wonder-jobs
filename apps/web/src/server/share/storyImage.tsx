import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";
import { companyLogo } from "@/server/jobslake/companies";
import { safeFetch } from "@/server/jobslake/safeFetch";
import { verifyImage } from "@/server/imageProxy";

/** A phone screen, portrait: WhatsApp Status, Instagram and Facebook Stories show it edge to edge. */
export const STORY = { width: 1080, height: 1920 } as const;

export interface StoryCard {
  /** "Job opening", "Internship", "Event"… */
  badge: string;
  title: string;
  /** The company or organiser, above the title. */
  byline?: string;
  /** Headline facts as chips; the first is highlighted. */
  chips: string[];
  /** Labelled details, one row each ("Subject: Maths"); a row without a label shows as plain text. */
  lines?: string[];
  /** The listing's own description, cut to fit: shown only when there are no highlights. */
  about?: string;
  /** The share summary's highlights (a few concrete details), and whether a model wrote them (labelled Summary: owner, 2026-11-03, "Instead of AI Summary just label it as Summary"). */
  highlights?: string[];
  ai?: boolean;
  /** The listing's own image (a company's logo) as a data URI, when there is one. */
  image?: string | null;
  /** A photo of the listing itself (a shop's product photo) as a data URI: shown large, in place of the logo. */
  photo?: string | null;
  /** The listing's public link, shown at the foot so a screenshot still says where to go. */
  url: string;
  /** Where the link is and what it does: "See the job and apply at the link in the message" (an image can't be tapped). */
  cta: string;
  /** The closing marketing line. */
  pitch: string;
}

/** Cut to `n` characters at a word (never inside a word or a number), with an ellipsis; a single long word is cut as is. */
export const clip = (s: string, n: number) => {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > n * 0.4 ? cut.slice(0, at) : cut).replace(/[\s,;:.·–—-]+$/, "")}…`;
};
const SHOWN = /^image\/(png|jpe?g|svg\+xml)$/i;

/**
 * A listing's public photo (its signed image-proxy path, `/api/img?u=…&s=…`) as a data URI, or null. Fetched straight from
 * the shop with the proxy's safeguards (signed URLs only, public addresses, size cap), asking for JPEG or PNG only: shop
 * CDNs answer WebP to browsers' Accept, and the image renderer can't draw WebP. Within 4 s, under 1.5 MB.
 */
export async function photoDataUri(path: string | undefined): Promise<string | null> {
  if (!path?.startsWith("/api/img?")) return null;
  const q = new URLSearchParams(path.slice("/api/img?".length));
  const url = q.get("u") ?? "";
  if (!url || !verifyImage(url, q.get("s") ?? "")) return null;
  try {
    const r = await safeFetch(url, { timeoutMs: 4_000, maxBytes: 1_500_000, headers: { accept: "image/jpeg,image/png;q=0.9" } });
    const type = r.contentType.split(";")[0].trim().toLowerCase();
    if (r.status !== 200 || !/^image\/(png|jpe?g)$/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(r.bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * A company's logo from the shared company directory as a data URI for the image renderer, or null when there is none
 * or it can't be read (then the card simply has no logo). Only PNG, JPEG and SVG: the renderer can't draw icons or WebP.
 */
export async function logoDataUri(q: { domain?: string; name?: string }): Promise<string | null> {
  const logo = await companyLogo(q).catch(() => null);
  if (!logo || !SHOWN.test(logo.type) || logo.data.length > 400_000) return null;
  return `data:${logo.type};base64,${logo.data.toString("base64")}`;
}

/** Where a listing came from: kept off the image (the page shows it), since it names our sources, not the listing. */
const PROVENANCE = /^(from|source):/i;

/**
 * "Subject: Maths" → ["Subject", "Maths"]; a row with no short label → [null, row]. Links are left out (they can't be
 * tapped in an image), and so is where the listing came from.
 */
export function detailRows(lines: string[] | undefined, max = 6): [string | null, string][] {
  return (lines ?? [])
    .filter((l) => !/https?:\/\//i.test(l) && !PROVENANCE.test(l.trim()))
    .map((l): [string | null, string] => {
      const m = /^([^:]{2,22}):\s+(.+)$/.exec(l.trim());
      return m ? [m[1], m[2]] : [null, l.trim()];
    })
    .filter(([, v]) => v)
    .slice(0, max);
}

/** Plain text from a description that may carry HTML, whitespace folded, cut at a word to `max`. */
export function aboutText(text: string | undefined, max: number): string {
  const t = (text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > max * 0.6 ? at : max).trimEnd()}…`;
}

/**
 * The portrait share image, the same for every module, filled with what the listing says: its image (a logo) when
 * present, the organisation, title and headline facts, its labelled details, a cut of its description, what the link
 * does, and the WonderWorks line at the foot. Built only from the listing's public details.
 */
export function storyImage(c: StoryCard): ImageResponse {
  const host = c.url.replace(/^https?:\/\//, "");
  const same = (s: string) => s.trim().toLowerCase() === c.title.trim().toLowerCase();
  const byline = c.byline && !same(c.byline) ? c.byline : undefined;
  const chips = c.chips.filter((x) => !same(x));
  const points = (c.highlights ?? []).filter(Boolean).slice(0, 3);
  const rows = detailRows(c.lines, c.photo ? 3 : points.length ? 4 : 6);
  // With no highlights, the description takes the room the details (and a photo) leave, so a short listing still fills the card.
  const about = points.length ? "" : aboutText(c.about, c.photo ? 220 : rows.length >= 5 ? 340 : rows.length >= 3 ? 460 : 660);
  const titleSize = c.title.length > 60 ? 70 : c.title.length > 32 ? 84 : 100;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "88px 72px 80px", background: "linear-gradient(160deg, #1E1B4B 0%, #312E81 50%, #5B21B6 100%)", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* next/og renders to a static image, not the DOM — a plain img is the only option here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandMarkDataUri()} alt="" width={72} height={72} />
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>WonderWorks</span>
          </div>
          <span style={{ display: "flex", padding: "12px 28px", borderRadius: 999, background: "rgba(167,139,250,0.2)", color: "#ddd6fe", fontSize: 32, fontWeight: 600 }}>{clip(c.badge, 22)}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "space-around", paddingTop: 40, paddingBottom: 40 }}>
          {c.photo && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 620, borderRadius: 40, background: "#ffffff", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws a plain img */}
              <img src={c.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {((c.image && !c.photo) || byline) && (
              <div style={{ display: "flex", alignItems: "center", gap: 32, marginBottom: 28 }}>
                {c.image && !c.photo && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 168, height: 168, borderRadius: 36, background: "#ffffff", boxShadow: "0 18px 44px rgba(0,0,0,0.35)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws a plain img */}
                    <img src={c.image} alt="" width={124} height={124} style={{ objectFit: "contain" }} />
                  </div>
                )}
                {byline && <span style={{ display: "flex", flexShrink: 1, fontSize: 46, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{clip(byline, 36)}</span>}
              </div>
            )}
            <span style={{ fontSize: c.photo ? Math.min(titleSize, 76) : titleSize, fontWeight: 700, lineHeight: 1.06, letterSpacing: -2 }}>{clip(c.title, 110)}</span>
            {chips.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 36 }}>
                {chips.slice(0, 5).map((chip, i) => (
                  <span key={`${chip}-${i}`} style={{ display: "flex", padding: "12px 28px", borderRadius: 999, background: i === 0 ? "#7C3AED" : "rgba(255,255,255,0.12)", fontSize: 36, fontWeight: i === 0 ? 700 : 500 }}>
                    {clip(chip, 34)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "34px 40px", borderRadius: 36, background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.12)" }}>
              {rows.map(([k, v], i) => (
                <div key={`${k}-${i}`} style={{ display: "flex", gap: 20, fontSize: 34, lineHeight: 1.3 }}>
                  {k && <span style={{ display: "flex", flexShrink: 0, width: 230, color: "#c4b5fd", fontWeight: 600 }}>{clip(k, 16)}</span>}
                  <span style={{ flex: 1, minWidth: 0, color: "#ffffff" }}>{clip(v, k ? 70 : 90)}</span>
                </div>
              ))}
            </div>
          )}

          {points.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: 2, color: "#c4b5fd" }}>SUMMARY</span>
              {points.map((p, i) => (
                <div key={`${p}-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 22 }}>
                  <span style={{ display: "flex", flexShrink: 0, width: 18, height: 18, marginTop: 14, borderRadius: 9, background: "#a78bfa" }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 40, lineHeight: 1.3, fontWeight: 600 }}>{p}</span>
                </div>
              ))}
            </div>
          )}

          {about && <span style={{ fontSize: 34, lineHeight: 1.42, color: "rgba(255,255,255,0.82)" }}>{about}</span>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 32, borderTop: "2px solid rgba(255,255,255,0.18)" }}>
          {/* A picture can't be tapped: the words say where the link is (in the message shared with it) and the address is readable to type. */}
          <span style={{ fontSize: 34, color: "rgba(255,255,255,0.75)" }}>{c.cta}</span>
          <span style={{ fontSize: 38, fontWeight: 700, color: "#ffffff" }}>{clip(host, 46)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 36, fontSize: 32, color: "rgba(255,255,255,0.75)" }}>
          {c.pitch}
        </div>
      </div>
    ),
    { ...STORY, headers: { "cache-control": "public, max-age=600, s-maxage=3600" } },
  );
}
