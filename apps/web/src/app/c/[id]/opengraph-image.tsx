import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";
import { communityCard } from "@/server/network/communities";
import { communityInitial, communityTone } from "@/domain/network/communities";

export const runtime = "nodejs";
export const alt = "A community on WonderWorks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The app's six community colours (`components/network/community.tsx`), as the image draws them. */
const TONES: [string, string][] = [
  ["#7c3aed", "#f472b6"],
  ["#0ea5e9", "#7c3aed"],
  ["#10b981", "#0ea5e9"],
  ["#f59e0b", "#ec4899"],
  ["#d946ef", "#6d28d9"],
  ["#14b8a6", "#10b981"],
];

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The card WhatsApp, X, Slack and iMessage show for a shared community (owner, 2026-11-23: "show logo of WonderWorks and
 * also community icon in the message"): the WonderWorks mark and name, the community's own mark (its letter on its
 * colour), its name, and how many members and discussions it has. A private community's link shares nothing about it.
 * Cached at the edge for a day, so a link passed around doesn't redraw it each time.
 */
export default async function SharedCommunityImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await communityCard(id, true).catch(() => null);
  const [from, to] = TONES[c ? communityTone(c.id) : 0];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(140deg, #1E1B4B 0%, #312E81 55%, #5B21B6 100%)", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* next/og renders to a static image, not the DOM — a plain img is the only option here. */}
            <img src={brandMarkDataUri()} alt="" width={64} height={64} />
            <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1 }}>WonderWorks</span>
          </div>
          <span style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(167,139,250,0.18)", color: "#c4b5fd", fontSize: 26, fontWeight: 600 }}>Community</span>
        </div>
        {c ? (
          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 180, height: 180, borderRadius: 50, background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`, fontSize: 96, fontWeight: 700, boxShadow: "0 0 0 8px rgba(255,255,255,0.12)" }}>{communityInitial(c.name)}</div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <span style={{ fontSize: c.name.length > 32 ? 56 : 68, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>{clip(c.name, 60)}</span>
              <div style={{ display: "flex", gap: 14, marginTop: 26 }}>
                <span style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "#7C3AED", fontSize: 28, fontWeight: 700 }}>
                  {c.members} member{c.members === 1 ? "" : "s"}
                </span>
                <span style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(255,255,255,0.1)", fontSize: 28 }}>
                  {c.discussions} discussion{c.discussions === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>A community on WonderWorks</span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "rgba(255,255,255,0.6)" }}>
          <span style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#a78bfa" }} />
          Join the conversation on WonderWorks
        </div>
      </div>
    ),
    { ...size, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" } },
  );
}
