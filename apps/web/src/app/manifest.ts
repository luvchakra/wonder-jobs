import type { MetadataRoute } from "next";

/** Web app manifest — makes WonderJobs installable (Chrome/Edge "Install app", Android "Add to Home screen"). */
export default function manifest(): MetadataRoute.Manifest {
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
    shortcuts: [
      { name: "Run Wonder", url: "/app/runs/new", description: "Start a new search-and-prepare run" },
      { name: "Jobs", url: "/app/jobs", description: "See every opportunity Wonder has found" },
      { name: "Applications", url: "/app/applications", description: "Track your in-progress applications" },
    ],
  };
}
