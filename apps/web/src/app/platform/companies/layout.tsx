import type { Metadata } from "next";

// The admin gate and the shell are the platform layout's (app/platform/layout.tsx).
export const metadata: Metadata = { title: "Companies" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
