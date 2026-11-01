import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OWNER_DECISIONS } from "@/server/jobslake/decisions";
import { INTERN_BOARDS } from "./providers";

/** Internships' India pass (WJ-581): the Apna gateway crawl, two more Indian boards, and the owner's calls on what can't be read. */
const file = join(__dirname, "../../../../data-gateway/sources/apna-internships.json");

describe("Apna internships, a paused gateway crawl for India", () => {
  it("is a valid gateway source for Internships in India, its terms pending, polite and bounded", async () => {
    const d = JSON.parse(readFileSync(file, "utf8"));
    const { validateSource } = (await import("../../../../data-gateway/src/core.mjs")) as unknown as { validateSource: (s: unknown) => { enabled: boolean; geography?: string[] } };
    const v = validateSource(d);
    // A gateway source starts paused until its Test passes and an admin activates it.
    expect(v).toMatchObject({ enabled: false, geography: ["IN"] });
    expect(d).toMatchObject({ kind: "crawl", discover: "sitemap", modules: ["internships"], geography: ["IN"], externalRedistributionAllowed: false });
    expect(d.permissionEvidence).toMatch(/^terms pending:/);
    expect(d.permissionEvidence.length).toBeLessThan(500);
    expect(d.crawlDelayMs).toBeGreaterThanOrEqual(2000);
    expect(d.minIntervalMinutes).toBeGreaterThanOrEqual(1440);
  });

  it("reads only internship job pages from Apna's sitemaps", async () => {
    const d = JSON.parse(readFileSync(file, "utf8"));
    const { crawlTargets } = (await import("../../../../data-gateway/src/crawl.mjs")) as unknown as { crawlTargets: (u: string[], s: unknown, r: unknown) => string[] };
    const urls = ["https://apna.co/job/pune/marketing-intern-41549", "https://apna.co/job/delhi/hr-internship-77001", "https://apna.co/job/hyderabad/sales-executive-63521514", "https://apna.co/candidate/profile-1", "https://apna.co/job/pune"];
    expect(crawlTargets(urls, d, []).sort()).toEqual(["https://apna.co/job/delhi/hr-internship-77001", "https://apna.co/job/pune/marketing-intern-41549"]);
  });
});

describe("India's other internship sources", () => {
  it("asks two more Indian boards with intern roles", () => {
    expect(INTERN_BOARDS.map((b) => b.company)).toEqual(expect.arrayContaining(["FamPay", "Hevo Data"]));
  });

  it("puts what can't be read on the owner's setup to-do: government portals and Internshala", () => {
    const ids = OWNER_DECISIONS.filter((d) => d.module === "internships").map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["india-gov-internships", "internshala-partnership", "unstop-robots"]));
  });
});
