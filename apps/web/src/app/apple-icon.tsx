import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon. No transparency — iOS applies its own rounded-square mask. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0F172A",
        }}
      >
        { }
        <img src={brandMarkDataUri()} alt="" width={128} height={128} />
      </div>
    ),
    { ...size },
  );
}
