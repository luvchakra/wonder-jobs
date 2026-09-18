import { ImageResponse } from "next/og";
import { brandMarkDataUri } from "@/server/brandMark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Browser-tab favicon: the WonderJobs butterfly on its brand gradient. */
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
          background: "linear-gradient(140deg, #1b1740 0%, #14142b 55%, #241c4d 100%)",
          borderRadius: 7,
        }}
      >
        { }
        <img src={brandMarkDataUri()} alt="" width={23} height={23} />
      </div>
    ),
    { ...size },
  );
}
