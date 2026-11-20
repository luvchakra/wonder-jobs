import { afterEach, describe, expect, it, vi } from "vitest";
import { bestApply, countryOf, dailyMax, DailyLimitError, fetchJSearch, jsearchRequests, rawFromJSearch, takeDaily, type CapStore, type JSearchJob } from "./jsearch";
import { probeFor } from "@/server/jobslake/keyTest";
import { BUILTIN_SOURCES } from "@/server/jobslake/registry";
import { NEVER_FOR_API } from "@/server/jobslake/developer";

const job = (over: Partial<JSearchJob> = {}): JSearchJob => ({
  job_id: "abc==",
  job_title: "Backend Engineer",
  employer_name: "Acme",
  employer_website: "https://www.acme.example",
  job_publisher: "LinkedIn",
  job_apply_link: "https://www.linkedin.com/jobs/view/1",
  job_apply_is_direct: false,
  apply_options: [
    { publisher: "LinkedIn", apply_link: "https://www.linkedin.com/jobs/view/1", is_direct: false },
    { publisher: "Acme Careers", apply_link: "https://careers.acme.example/jobs/1", is_direct: true },
  ],
  job_description: "Build APIs.",
  job_is_remote: false,
  job_city: "Bengaluru",
  job_state: "Karnataka",
  job_country: "IN",
  job_posted_at_datetime_utc: "2026-11-04T10:00:00.000Z",
  job_min_salary: 100,
  job_max_salary: 150,
  job_salary_period: "MONTH",
  job_employment_types: ["FULLTIME"],
  ...over,
});

const memoryCap = (): CapStore & { doc?: { day: string; used: number } } => {
  const s: CapStore & { doc?: { day: string; used: number } } = { get: async () => s.doc, put: async (d) => void (s.doc = d) };
  return s;
};

afterEach(() => vi.unstubAllGlobals());

describe("JSearch: where it's asked", () => {
  it("places a search in a country, never falling back to JSearch's US default", () => {
    expect(countryOf("Bengaluru")).toBe("in");
    expect(countryOf("Lucknow")).toBe("in");
    expect(countryOf("London")).toBe("gb");
    expect(countryOf("Dubai")).toBe("ae");
    expect(countryOf("Nairobi, Kenya")).toBe("ke");
    expect(countryOf("Atlantis")).toBeUndefined();
  });

  it("asks only a worded search, once per country, with the board's own words", () => {
    expect(jsearchRequests({ query: "", locations: ["Bengaluru"] })).toEqual([]);
    expect(jsearchRequests({ query: "backend engineer", locations: [] })).toEqual([]);
    expect(jsearchRequests({ query: "backend engineer", locations: ["Atlantis"] })).toEqual([]);
    const reqs = jsearchRequests({ query: "backend engineer", locations: ["Bengaluru", "Pune", "London"] });
    expect(reqs.map((r) => r.country)).toEqual(["in", "gb"]);
    const q = new URL(reqs[0].url).searchParams;
    expect(new URL(reqs[0].url).host).toBe("jsearch.p.rapidapi.com");
    expect(q.get("query")).toBe("backend engineer in Bengaluru or Pune");
    expect(q.get("country")).toBe("in");
    expect(q.get("num_pages")).toBe("1");
    expect(q.get("date_posted")).toBe("month");
  });

  it("asks a repeat search only for what's new, and a remote one for remote jobs", () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    const [r] = jsearchRequests({ query: "designer", locations: ["Remote", "Mumbai"], since: "2026-11-04T12:00:00Z" }, now);
    const q = new URL(r.url).searchParams;
    expect(q.get("date_posted")).toBe("today");
    expect(q.get("work_from_home")).toBe("true");
  });
});

describe("JSearch: listings", () => {
  it("prefers the employer's own apply link and keeps the board it came from", () => {
    expect(bestApply(job())).toEqual({ url: "https://careers.acme.example/jobs/1", direct: true, via: "LinkedIn" });
    expect(bestApply(job({ apply_options: [] }))).toEqual({ url: "https://www.linkedin.com/jobs/view/1", direct: false, via: "LinkedIn" });
    const raw = rawFromJSearch(job())!;
    expect(raw).toMatchObject({
      externalId: "jsearch:abc==",
      company: "Acme",
      companyDomain: "acme.example",
      location: "Bengaluru, Karnataka, IN",
      applyUrl: "https://careers.acme.example/jobs/1",
      employerSite: true,
      applyPath: "employer_site",
      tags: ["via LinkedIn"],
      attributes: { via: "LinkedIn" },
      salaryMin: 1200,
      salaryMax: 1800,
    });
  });

  it("drops a listing with no way to apply, and reads a board-only one as the board's", () => {
    expect(rawFromJSearch(job({ job_apply_link: null, apply_options: [] }))).toBeNull();
    const board = rawFromJSearch(job({ apply_options: null, job_salary_period: null }))!;
    expect(board).toMatchObject({ applyUrl: "https://www.linkedin.com/jobs/view/1", employerSite: false, applyPath: "platform", salaryMin: null });
  });
});

describe("JSearch: daily cap", () => {
  it("counts requests per UTC day and refuses past the cap", async () => {
    const store = memoryCap();
    const day1 = new Date("2026-11-05T10:00:00Z");
    await takeDaily(2, 3, store, day1);
    await expect(takeDaily(2, 3, store, day1)).rejects.toBeInstanceOf(DailyLimitError);
    await expect(takeDaily(2, 3, store, day1)).rejects.toThrow(/^Daily limit reached/);
    await takeDaily(1, 3, store, day1);
    expect(store.doc).toEqual({ day: "2026-11-05", used: 3 });
    await takeDaily(3, 3, store, new Date("2026-11-06T00:01:00Z"));
    expect(store.doc).toEqual({ day: "2026-11-06", used: 3 });
  });

  it("defaults to 150 a day; JSEARCH_DAILY_MAX overrides it", () => {
    expect(dailyMax({})).toBe(150);
    expect(dailyMax({ JSEARCH_DAILY_MAX: "40" })).toBe(40);
    expect(dailyMax({ JSEARCH_DAILY_MAX: "0" })).toBe(0);
    expect(dailyMax({ JSEARCH_DAILY_MAX: "lots" })).toBe(150);
  });

  it("asks nothing when the cap is spent, and nothing without a key", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const spent = async () => {
      throw new DailyLimitError(150);
    };
    await expect(fetchJSearch("jsearch", { query: "engineer", locations: ["Pune"] }, "k", spent)).rejects.toThrow(/Daily limit reached/);
    expect(await fetchJSearch("jsearch", { query: "engineer", locations: ["Pune"] }, "")).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("charges one request per country and sends the RapidAPI headers", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ status: "OK", data: [job()] }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const cap = vi.fn(async () => {});
    const jobs = await fetchJSearch("jsearch", { query: "backend engineer", locations: ["Bengaluru"] }, "rk", cap);
    expect(cap).toHaveBeenCalledWith(1);
    expect(f).toHaveBeenCalledTimes(1);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.headers).toMatchObject({ "X-RapidAPI-Key": "rk", "X-RapidAPI-Host": "jsearch.p.rapidapi.com" });
    expect(jobs.length).toBe(1);
    expect(jobs[0].applyUrl).toBe("https://careers.acme.example/jobs/1");
  });
});

describe("JSearch: registry", () => {
  it("is an On-search Jobs source, asked once per search, needing its key, with terms pending, never for API keys", () => {
    const s = BUILTIN_SOURCES.find((x) => x.id === "jsearch")!;
    expect(s).toMatchObject({ module: "jobs", onePhrasing: true, secretRef: "env:JSEARCH", accessStrategy: "licensed" });
    expect(s.paid).toBeFalsy();
    expect(s.statusReason).toMatch(/^terms pending: JSearch collects Google for Jobs listings/);
    expect(NEVER_FOR_API.has("jsearch")).toBe(true);
    const probe = probeFor("JSEARCH_API_KEY")!;
    const req = probe.request(() => "rk");
    expect(new URL(req.url).host).toBe("jsearch.p.rapidapi.com");
    expect(req.init?.headers).toMatchObject({ "X-RapidAPI-Key": "rk" });
  });
});
