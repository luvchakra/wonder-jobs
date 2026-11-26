import { afterEach, describe, expect, it, vi } from "vitest";
import { detectSource, parseWorkdaySlug, workdaySlug } from "@/domain/jobslake/detect";
import { fetchAtsBoard, workdayPostedAt } from "./ats";

// Shapes as Travelers' Workday site answered on 2026-11-26 (WJ-872).
const LIST = {
  total: 2,
  jobPostings: [
    { title: "Development Underwriter - SME", externalPath: "/job/LAN---Manchester/Development-Underwriter---SME_R-53149-1", locationsText: "2 Locations", postedOn: "Posted 20 Days Ago", remoteType: "Hybrid", bulletFields: ["R-53149"] },
    { title: "Claims Underwriting Analyst", externalPath: "/job/CT---Hartford/Claims-Underwriting-Analyst_R-1", locationsText: "CT - Hartford", postedOn: "Posted 30+ Days Ago", bulletFields: ["R-1"] },
  ],
};
const DETAIL = { jobPostingInfo: { title: "Development Underwriter - SME", jobDescription: "<p>Underwrite <b>SME</b> property risks.</p>", location: "LAN - Manchester", additionalLocations: ["LAN - London"], startDate: "2026-11-06", timeType: "Full time", jobReqId: "R-53149", remoteType: "Hybrid", externalUrl: "https://travelers.wd5.myworkdayjobs.com/External/job/LAN---Manchester/Development-Underwriter---SME_R-53149-1" } };

afterEach(() => vi.unstubAllGlobals());

describe("Workday career sites", () => {
  it("detects a career site from its page, a job page with a locale, or the endpoint", () => {
    for (const url of ["https://travelers.wd5.myworkdayjobs.com/External", "https://travelers.wd5.myworkdayjobs.com/en-US/External/job/CT---Hartford/x_R-1", "https://travelers.wd5.myworkdayjobs.com/wday/cxs/travelers/External/jobs"]) {
      const d = detectSource(url);
      expect(d.kind).toBe("ats_board");
      if (d.kind === "ats_board") {
        expect(d.platform).toBe("workday");
        expect(d.slug).toBe("travelers.wd5.External");
        expect(d.boardUrl).toBe("https://travelers.wd5.myworkdayjobs.com/External");
      }
    }
    expect(detectSource("https://travelers.wd5.myworkdayjobs.com/").kind).toBe("invalid");
  });

  it("keeps a site in one slug and refuses anything else", () => {
    expect(parseWorkdaySlug("hiscox.wd3.Hiscox_External_Site")).toEqual({ tenant: "hiscox", host: "wd3", site: "Hiscox_External_Site" });
    expect(workdaySlug({ tenant: "mmc", host: "wd1", site: "MMC" })).toBe("mmc.wd1.MMC");
    for (const bad of ["travelers", "travelers.External", "travelers.xx5.External", "trav/elers.wd5.External", "travelers.wd5."]) expect(parseWorkdaySlug(bad)).toBeUndefined();
  });

  it("turns only exact relative dates into dates; 30+ days gives none", () => {
    const now = Date.parse("2026-11-26T00:00:00Z");
    expect(workdayPostedAt("Posted Today", now)).toBe("2026-11-26T00:00:00.000Z");
    expect(workdayPostedAt("Posted Yesterday", now)).toBe("2026-11-25T00:00:00.000Z");
    expect(workdayPostedAt("Posted 3 Days Ago", now)).toBe("2026-11-23T00:00:00.000Z");
    expect(workdayPostedAt("Posted 30+ Days Ago", now)).toBeUndefined();
    expect(workdayPostedAt(undefined, now)).toBeUndefined();
  });

  it("reads a site: searches with the query, details the first postings, links each to its own page", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const body = url.endsWith("/jobs") ? LIST : url.includes("Development-Underwriter") ? DETAIL : { jobPostingInfo: {} };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const jobs = await fetchAtsBoard({ platform: "workday", slug: "travelers.wd5.External", company: "Travelers", domain: "travelers.com" }, { query: "underwriter", locations: [] }, "normal");
    const list = calls.find((c) => c.url.endsWith("/jobs"));
    expect(list?.url).toBe("https://travelers.wd5.myworkdayjobs.com/wday/cxs/travelers/External/jobs");
    expect(list?.init?.method).toBe("POST");
    expect(JSON.parse(String(list?.init?.body))).toMatchObject({ limit: 20, offset: 0, searchText: "underwriter" });
    const first = jobs.find((j) => j.title === "Development Underwriter - SME");
    expect(first?.company).toBe("Travelers");
    expect(first?.applyUrl).toBe(DETAIL.jobPostingInfo.externalUrl);
    expect(first?.location).toContain("LAN - Manchester");
    expect(first?.location).toContain("LAN - London");
    expect(first?.description).toContain("Underwrite SME property risks.");
  });

  it("says when a site can't be read, rather than returning nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 422 })));
    await expect(fetchAtsBoard({ platform: "workday", slug: "travelers.wd5.Nope", company: "Travelers" }, { query: "", locations: [] })).rejects.toThrow(/422/);
    await expect(fetchAtsBoard({ platform: "workday", slug: "not-a-site", company: "X" }, { query: "", locations: [] })).rejects.toThrow(/Workday/);
  });
});
