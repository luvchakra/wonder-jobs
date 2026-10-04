import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";

export const runtime = "nodejs";

/**
 * PWA manifest icon (512×512, purpose "maskable"): the mark is as large as fits inside the maskable
 * safe zone (a centred circle, 80% of the canvas) — its wing tips just inside that circle — so it fills
 * the installed icon without any launcher mask (circle, squircle, rounded square) clipping it.
 * Served at a fixed path so manifest.ts can reference it.
 */
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(140deg, #1b1740 0%, #14142b 55%, #241c4d 100%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brandMarkDataUri()} alt="" width={330} height={330} />
      </div>
    ),
    { width: 512, height: 512 },
  );
}
