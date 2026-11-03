import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";
import { companyLogo } from "@/server/jobslake/companies";

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
  /** The listing's own description, cut to fit. */
  about?: string;
  /** The listing's own image (a company's logo) as a data URI, when there is one. */
  image?: string | null;
  /** The listing's public link, shown at the foot so a screenshot still says where to go. */
  url: string;
  /** What the link does: "Tap the link to see the job and apply". */
  cta: string;
  /** The closing marketing line. */
  pitch: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const SHOWN = /^image\/(png|jpe?g|svg\+xml)$/i;

/**
 * A company's logo from the shared company directory as a data URI for the image renderer, or null when there is none
 * or it can't be read (then the card simply has no logo). Only PNG, JPEG and SVG: the renderer can't draw icons or WebP.
 */
export async function logoDataUri(q: { domain?: string; name?: string }): Promise<string | null> {
  const logo = await companyLogo(q).catch(() => null);
  if (!logo || !SHOWN.test(logo.type) || logo.data.length > 400_000) return null;
  return `data:${logo.type};base64,${logo.data.toString("base64")}`;
}

/** "Subject: Maths" → ["Subject", "Maths"]; a row with no short label → [null, row]. Links are left out: they can't be tapped in an image. */
export function detailRows(lines: string[] | undefined, max = 6): [string | null, string][] {
  return (lines ?? [])
    .filter((l) => !/https?:\/\//i.test(l))
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
  const rows = detailRows(c.lines);
  // The description takes the room the details leave, so a short listing still fills the card.
  const about = aboutText(c.about, rows.length >= 5 ? 340 : rows.length >= 3 ? 460 : 660);
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
          <div style={{ display: "flex", flexDirection: "column" }}>
            {(c.image || c.byline) && (
              <div style={{ display: "flex", alignItems: "center", gap: 32, marginBottom: 28 }}>
                {c.image && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 168, height: 168, borderRadius: 36, background: "#ffffff", boxShadow: "0 18px 44px rgba(0,0,0,0.35)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws a plain img */}
                    <img src={c.image} alt="" width={124} height={124} style={{ objectFit: "contain" }} />
                  </div>
                )}
                {c.byline && <span style={{ display: "flex", flexShrink: 1, fontSize: 46, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{clip(c.byline, 36)}</span>}
              </div>
            )}
            <span style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.06, letterSpacing: -2 }}>{clip(c.title, 110)}</span>
            {c.chips.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 36 }}>
                {c.chips.slice(0, 5).map((chip, i) => (
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

          {about && <span style={{ fontSize: 34, lineHeight: 1.42, color: "rgba(255,255,255,0.82)" }}>{about}</span>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "36px 42px", borderRadius: 36, background: "#ffffff", color: "#1E1B4B" }}>
          <span style={{ fontSize: 40, fontWeight: 700 }}>{c.cta}</span>
          <span style={{ fontSize: 30, color: "#6D28D9", fontWeight: 600 }}>{clip(host, 52)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 36, fontSize: 32, color: "rgba(255,255,255,0.75)" }}>
          <span style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: "#a78bfa" }} />
          {c.pitch}
        </div>
      </div>
    ),
    { ...STORY, headers: { "cache-control": "public, max-age=3600, s-maxage=3600" } },
  );
}
