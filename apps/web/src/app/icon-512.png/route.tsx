import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";

export const runtime = "nodejs";

/** PWA manifest icon (512×512, purpose "any"). Served at a fixed path so manifest.ts can reference it. */
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
          background: "#FFFFFF",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brandMarkDataUri()} alt="" width={360} height={360} />
      </div>
    ),
    { width: 512, height: 512 },
  );
}
