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
          background: "linear-gradient(140deg, #1b1740 0%, #14142b 55%, #241c4d 100%)",
        }}
      >
        { }
        <img src={brandMarkDataUri()} alt="" width={122} height={122} />
      </div>
    ),
    { ...size },
  );
}
