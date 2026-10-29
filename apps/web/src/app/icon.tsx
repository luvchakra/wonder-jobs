import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Browser-tab favicon: the WonderWorks mark on Deep Navy. */
export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        { }
        <img src={brandMarkDataUri()} alt="" width={26} height={26} />
      </div>
    ),
    { ...size },
  );
}
