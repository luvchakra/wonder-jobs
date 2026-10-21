import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots.txt", () => {
  it("turns AI crawlers away from the whole site", () => {
    const ai = robots().rules as { userAgent: string[]; disallow: string }[];
    expect(ai[0].userAgent).toEqual(expect.arrayContaining(["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "PerplexityBot"]));
    expect(ai[0].disallow).toBe("/");
  });

  it("lets search engines see the marketing pages, not the product", () => {
    const all = (robots().rules as { userAgent: string | string[]; allow?: string; disallow: string[] }[])[1];
    expect(all.userAgent).toBe("*");
    expect(all.allow).toBe("/");
    expect(all.disallow).toEqual(expect.arrayContaining(["/app", "/api", "/help", "/platform"]));
    expect(all.disallow).not.toContain("/j");
  });
});
