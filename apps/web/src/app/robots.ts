import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/siteUrl";
import { AI_CRAWLERS, PRIVATE_PATHS } from "@/lib/robots";

/** robots.txt: the marketing pages are public, the product isn't, and AI crawlers are turned away from everything. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_CRAWLERS, disallow: "/" },
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    ],
    host: siteUrl().origin,
  };
}
