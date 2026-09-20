import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { siteUrl } from "@/lib/siteUrl";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const TITLE = "WonderJobs — Your next opportunity is out there. Wonder finds it.";
const DESCRIPTION =
  "WonderJobs is your AI job-search agent. It scans the market, finds opportunities that actually fit you, and helps you take the next step — with less effort and more clarity.";

export const metadata: Metadata = {
  // Without this, Next emits *relative* og:image URLs and no link-preview scraper can fetch them —
  // which is why a shared link used to show a title and description but no logo.
  metadataBase: siteUrl(),
  title: { default: TITLE, template: "%s · WonderJobs" },
  description: DESCRIPTION,
  applicationName: "WonderJobs",
  // manifest.ts and apple-icon.tsx are picked up automatically by their file names; this fills in the
  // iOS-specific "add to home screen" tags that a web manifest alone doesn't cover.
  appleWebApp: { capable: true, title: "WonderJobs", statusBarStyle: "default" },
  // `opengraph-image.tsx` supplies the image itself, by file convention, for every page that doesn't
  // override it. `title`/`description` are deliberately *not* pinned here: leaving them out lets each
  // page's own title and description flow into og:title/og:description, so a shared link names the
  // page rather than always saying "WonderJobs".
  openGraph: { type: "website", siteName: "WonderJobs", url: siteUrl(), locale: "en_US" },
  twitter: { card: "summary_large_image" },
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
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
