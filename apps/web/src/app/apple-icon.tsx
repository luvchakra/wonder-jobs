import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon (`<link rel="apple-touch-icon">`, auto-injected by Next.js from this file). No
 * transparency — iOS composites its own rounded-square mask, so a solid background is required. */
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
          background: "linear-gradient(135deg, #6d4cf5 0%, #7c5cff 55%, #a66bff 100%)",
        }}
      >
        <svg width="118" height="118" viewBox="0 0 32 32">
          <path d="M4 7.5c0-1.2 1.5-1.8 2.4-.9L16 16l-5.7 8.4c-.6.9-2 .7-2.3-.4L4 7.5z" fill="#dcd4ff" />
          <path d="M28 7.5c0-1.2-1.5-1.8-2.4-.9L16 16l5.7 8.4c.6.9 2 .7 2.3-.4L28 7.5z" fill="#f0e6ff" />
          <path d="M16 16l-3.2 9.6c-.3.9.9 1.6 1.5.9L16 24.4l1.7 2.1c.6.7 1.8 0 1.5-.9L16 16z" fill="#fff" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
