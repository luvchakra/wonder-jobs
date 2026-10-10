import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/**
 * Web app manifest — makes WonderJobs installable (Chrome/Edge "Install app", Android "Add to Home screen").
 *
 * `related_applications` lists this web app itself so a normal browser tab can ask
 * `navigator.getInstalledRelatedApps()` whether it's already installed and keep the install banner away
 * (WJ-301). Browsers only honour a same-origin entry, so the absolute URL is built from the host that
 * asked — production, a preview deployment or localhost each name themselves. That makes this route
 * dynamic, which costs nothing for a file this small.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const h = await headers();
  const host = h.get("host") ?? h.get("x-forwarded-host");
  const local = !!host && /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (local ? "http" : "https");
  return {
    id: "/app",
    name: "WonderJobs — Your AI job-search agent",
    short_name: "WonderJobs",
    description: "WonderJobs scans the market, finds opportunities that actually fit you, and helps you take the next step.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f6f6fb",
    theme_color: "#f6f6fb",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Real screens from the product (the landing page's own captures), for Chrome's richer install sheet.
    screenshots: [
      { src: "/landing/step-4-ready.webp", sizes: "716x958", type: "image/webp", form_factor: "narrow", label: "Ready to apply: résumé, details and answers checked" },
      { src: "/landing/step-1-search.webp", sizes: "780x620", type: "image/webp", form_factor: "wide", label: "Tell Wonder the role and see the jobs it found" },
      { src: "/landing/step-6-pipeline.webp", sizes: "780x606", type: "image/webp", form_factor: "wide", label: "Track every application in Pipeline" },
    ],
    related_applications: host ? [{ platform: "webapp", url: `${proto}://${host}/manifest.webmanifest` }] : [],
    prefer_related_applications: false,
    shortcuts: [
      { name: "Find jobs", url: "/app/jobs", description: "Your jobs, ranked by fit" },
      { name: "Jobs", url: "/app/jobs", description: "See every opportunity Wonder has found" },
      { name: "Applications", url: "/app/applications", description: "Track your in-progress applications" },
    ],
  };
}
