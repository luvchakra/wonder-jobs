import type { Metadata, Viewport } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import { InstallBanner } from "@/components/pwa/InstallBanner";
import { INSTALL_EARLY_CAPTURE } from "@/lib/installBanner";
import { siteUrl } from "@/lib/siteUrl";
import "./globals.css";

// The WonderStar typeface (docs/WONDERSTAR_PLATFORM.md §9). Not a variable font, so the four weights the UI
// uses are listed: normal, medium, semibold, bold.
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const TITLE = "WonderStar — Your next opportunity is out there. Wonder finds it.";
const DESCRIPTION =
  "WonderStar is your AI job-search agent. It scans the market, finds opportunities that actually fit you, and helps you take the next step — with less effort and more clarity.";

export const metadata: Metadata = {
  // Without this, Next emits *relative* og:image URLs and no link-preview scraper can fetch them —
  // which is why a shared link used to show a title and description but no logo.
  metadataBase: siteUrl(),
  title: { default: TITLE, template: "%s · WonderStar" },
  description: DESCRIPTION,
  applicationName: "WonderStar",
  // manifest.ts and apple-icon.tsx are picked up automatically by their file names; this fills in the
  // iOS-specific "add to home screen" tags that a web manifest alone doesn't cover.
  appleWebApp: { capable: true, title: "WonderStar", statusBarStyle: "default" },
  // Next now writes `capable` as the standard `mobile-web-app-capable`; older iOS versions only read the
  // Apple-prefixed tag, so it's set explicitly too (WJ-301).
  other: { "apple-mobile-web-app-capable": "yes" },
  // `opengraph-image.tsx` supplies the image itself, by file convention, for every page that doesn't
  // override it. `title`/`description` are deliberately *not* pinned here: leaving them out lets each
  // page's own title and description flow into og:title/og:description, so a shared link names the
  // page rather than always saying "WonderJobs".
  openGraph: { type: "website", siteName: "WonderStar", url: siteUrl(), locale: "en_US" },
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
    <html lang="en" className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* Holds Chromium's install prompt if it fires before the app's JavaScript loads (WJ-301). */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_EARLY_CAPTURE }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Phones and tablets only, when this browser can install the app and it isn't installed. */}
        <InstallBanner />
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
