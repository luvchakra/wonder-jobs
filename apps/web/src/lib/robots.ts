import type { Metadata } from "next";

/** Signed-in and operator pages: never indexed, and marked not for AI training or image use. Crawlers combine the two robots tags. */
export const PRIVATE_PAGE: Pick<Metadata, "robots" | "other"> = { robots: { index: false, follow: false }, other: { robots: "noai, noimageai" } };

/** Crawlers that collect pages for AI models or AI answers. Each is turned away from the whole site in robots.txt. */
export const AI_CRAWLERS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "CCBot", "PerplexityBot", "Google-Extended", "Applebot-Extended", "Bytespider", "Amazonbot", "meta-externalagent", "cohere-ai", "Diffbot"];

/** Paths only a signed-in person (or the app itself) uses. Search engines may crawl the marketing pages and shared job pages, nothing else. */
export const PRIVATE_PATHS = ["/app", "/api", "/help", "/platform", "/onboarding", "/demo", "/auth"];
