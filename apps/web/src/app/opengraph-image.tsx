import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";

export const alt = "WonderJobs — your AI job-search agent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card every shared link shows — WhatsApp, Slack, iMessage, X. Flat
 * colours and one small mark on purpose: WhatsApp silently drops a preview
 * image over a few hundred KB, and this renders well under that.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 84,
          background: "linear-gradient(140deg, #1b1740 0%, #14142b 55%, #241c4d 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* next/og renders to a static image, not the DOM — a plain img is the only option here. */}
          <img src={brandMarkDataUri()} alt="" width={86} height={86} />
          <span style={{ fontSize: 50, fontWeight: 700, letterSpacing: -1 }}>WonderJobs</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2 }}>Your next opportunity</span>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -2, color: "#a78bfa" }}>is out there.</span>
          <span style={{ marginTop: 26, fontSize: 30, color: "rgba(255,255,255,0.72)" }}>An AI job-search agent that searches real sources and explains every match.</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "rgba(255,255,255,0.55)" }}>
          <span style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: "#6d4cf5" }} />
          jobs.wonderapps.biz
        </div>
      </div>
    ),
    { ...size },
  );
}
