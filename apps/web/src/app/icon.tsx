import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Browser-tab favicon: the WonderMark on its brand gradient, filling the frame. */
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
          background: "linear-gradient(135deg, #6d4cf5 0%, #7c5cff 55%, #a66bff 100%)",
          borderRadius: 7,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 32 32">
          <path d="M4 7.5c0-1.2 1.5-1.8 2.4-.9L16 16l-5.7 8.4c-.6.9-2 .7-2.3-.4L4 7.5z" fill="#dcd4ff" />
          <path d="M28 7.5c0-1.2-1.5-1.8-2.4-.9L16 16l5.7 8.4c.6.9 2 .7 2.3-.4L28 7.5z" fill="#f0e6ff" />
          <path d="M16 16l-3.2 9.6c-.3.9.9 1.6 1.5.9L16 24.4l1.7 2.1c.6.7 1.8 0 1.5-.9L16 16z" fill="#fff" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
