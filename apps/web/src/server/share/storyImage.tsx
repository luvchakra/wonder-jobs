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

/**
 * The portrait share image, the same for every module: the listing's image (when present) large and clear, its title and
 * facts, what the link does, and the WonderWorks line at the foot. Built only from the listing's public details.
 */
export function storyImage(c: StoryCard): ImageResponse {
  const host = c.url.replace(/^https?:\/\//, "");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "96px 80px 88px", background: "linear-gradient(160deg, #1E1B4B 0%, #312E81 50%, #5B21B6 100%)", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* next/og renders to a static image, not the DOM — a plain img is the only option here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandMarkDataUri()} alt="" width={76} height={76} />
            <span style={{ fontSize: 46, fontWeight: 700, letterSpacing: -1 }}>WonderWorks</span>
          </div>
          <span style={{ display: "flex", padding: "12px 28px", borderRadius: 999, background: "rgba(167,139,250,0.2)", color: "#ddd6fe", fontSize: 32, fontWeight: 600 }}>{clip(c.badge, 22)}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>
          {c.image && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 280, height: 280, borderRadius: 56, background: "#ffffff", marginBottom: 64, boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws a plain img */}
              <img src={c.image} alt="" width={200} height={200} style={{ objectFit: "contain" }} />
            </div>
          )}
          {c.byline && <span style={{ fontSize: 48, fontWeight: 600, color: "rgba(255,255,255,0.78)" }}>{clip(c.byline, 40)}</span>}
          <span style={{ marginTop: 16, fontSize: c.title.length > 60 ? 76 : c.title.length > 32 ? 92 : 108, fontWeight: 700, lineHeight: 1.06, letterSpacing: -2 }}>{clip(c.title, 110)}</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 48 }}>
            {c.chips.slice(0, 5).map((chip, i) => (
              <span key={`${chip}-${i}`} style={{ display: "flex", padding: "14px 30px", borderRadius: 999, background: i === 0 ? "#7C3AED" : "rgba(255,255,255,0.12)", fontSize: 38, fontWeight: i === 0 ? 700 : 500 }}>
                {clip(chip, 34)}
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: "40px 44px", borderRadius: 40, background: "#ffffff", color: "#1E1B4B" }}>
          <span style={{ fontSize: 42, fontWeight: 700 }}>{c.cta}</span>
          <span style={{ fontSize: 32, color: "#6D28D9", fontWeight: 600 }}>{clip(host, 48)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 44, fontSize: 32, color: "rgba(255,255,255,0.72)" }}>
          <span style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: "#a78bfa" }} />
          {c.pitch}
        </div>
      </div>
    ),
    { ...STORY, headers: { "cache-control": "public, max-age=3600, s-maxage=3600" } },
  );
}
