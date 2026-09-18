import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auto-memoizes components and hooks so re-renders stay cheap without hand-written memo.
  reactCompiler: true,
  experimental: {
    // Keep visited product pages in the client router cache: back/forward and
    // repeat navigations render instantly instead of refetching the segment.
    staleTimes: { dynamic: 300, static: 300 },
  },
};

export default nextConfig;
