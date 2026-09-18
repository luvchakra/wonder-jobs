import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";

export const runtime = "nodejs";

/** PWA manifest icon (192×192, purpose "any"). Served at a fixed path so manifest.ts can reference it. */
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
        <img src={brandMarkDataUri()} alt="" width={126} height={126} />
      </div>
    ),
    { width: 192, height: 192 },
  );
}
