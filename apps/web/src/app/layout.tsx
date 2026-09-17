import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "WonderJobs — Your next opportunity is out there. Wonder finds it.", template: "%s · WonderJobs" },
  description:
    "WonderJobs is your AI job-search agent. It scans the market, finds opportunities that actually fit you, and helps you take the next step — with less effort and more clarity.",
  applicationName: "WonderJobs",
};

export const viewport: Viewport = {
  themeColor: "#f6f6fb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
