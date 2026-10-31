import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";
import { sharedListing } from "@/server/share/listing";

export const runtime = "nodejs";
export const alt = "A listing shared from WonderWorks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The big card WhatsApp (and Slack, iMessage, X) shows for a shared listing: its kind, its title and its headline facts
 * (price, place, when…) as the listing reads right now, and the WonderWorks mark. Flat colours keep it far under
 * WhatsApp's image-size limit.
 */
export default async function SharedListingImage({ params }: { params: Promise<{ module: string; id: string }> }) {
  const { module, id } = await params;
  const l = await sharedListing(module, id);
  const chips = (l?.facts ?? []).filter((x): x is string => !!x).slice(0, 4);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(140deg, #1E1B4B 0%, #312E81 55%, #5B21B6 100%)", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* next/og renders to a static image, not the DOM — a plain img is the only option here. */}
            <img src={brandMarkDataUri()} alt="" width={64} height={64} />
            <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1 }}>WonderWorks</span>
          </div>
          <span style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(167,139,250,0.18)", color: "#c4b5fd", fontSize: 26, fontWeight: 600 }}>{l ? l.noun[0].toUpperCase() + l.noun.slice(1) : "Shared listing"}</span>
        </div>
        {l ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: l.title.length > 40 ? 60 : 72, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>{clip(l.title, 80)}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 30 }}>
              {chips.map((c, i) => (
                <span key={c} style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: i === 0 ? "#7C3AED" : "rgba(255,255,255,0.1)", fontSize: 28, fontWeight: i === 0 ? 700 : 400 }}>
                  {clip(c, 40)}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>Your next opportunity is out there.</span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "rgba(255,255,255,0.6)" }}>
          <span style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#a78bfa" }} />
          Found with WonderWorks
        </div>
      </div>
    ),
    { ...size },
  );
}
