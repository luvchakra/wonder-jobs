import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const list = vi.fn();
const getJob = vi.fn();
vi.mock("@/server/careerSite/client", async (orig) => {
  const real = await orig<typeof import("@/server/careerSite/client")>();
  return { ...real, listCareerJobs: () => list(), getCareerJob: (id: string) => getJob(id) };
});
let isAdmin = false;
vi.mock("@/server/jobslake/access", () => ({ currentAdmin: async () => (isAdmin ? { actor: "admin@wonderapps.biz" } : null) }));
let key: string | null = "wjcs_" + "k".repeat(30);
vi.mock("@/server/careerSite/key", () => ({ resolveCareersKey: async () => key }));

import CareersPage from "./page";
import CareersStatusPage, { metadata as statusMetadata } from "./status/page";
import { CareerJobPage } from "./_site/JobPage";
import { consentText } from "@/components/careers/CareersApplyForm";
import nextConfig from "../../../next.config";

const job = { id: "job_abc123", title: "Product Engineer", location: "Bengaluru", workMode: "hybrid", jobType: "full_time", salaryMin: 2_000_000, salaryMax: 3_000_000, currency: "INR", description: "Line one\n<script>alert(1)</script>", skills: ["TypeScript", "Postgres"], company: "WonderJobs", updatedAt: "2026-10-21T00:00:00Z" };
const html = async (el: Promise<React.ReactElement> | React.ReactElement) => renderToStaticMarkup(await el);

beforeEach(() => {
  list.mockReset();
  getJob.mockReset();
  isAdmin = false;
  key = "wjcs_" + "k".repeat(30);
  vi.unstubAllGlobals();
});

describe("/careers", () => {
  it("lists only the jobs the careers API returned, with their facts and links", async () => {
    list.mockResolvedValue({ state: "ok", data: { site: { name: "WonderJobs careers", retentionMonths: 12 }, jobs: [job] } });
    const out = await html(CareersPage());
    expect(out).toContain("Product Engineer");
    expect(out).toContain('href="/careers/job_abc123"');
    expect(out).toContain("Bengaluru · Hybrid · Full-time · ₹20L");
    expect(out).toContain("TypeScript, Postgres");
    expect(out.match(/href="\/careers\/job_/g)).toHaveLength(1);
  });

  it("says there are no open positions, never a placeholder", async () => {
    list.mockResolvedValue({ state: "ok", data: { site: { name: "s", retentionMonths: null }, jobs: [] } });
    const out = await html(CareersPage());
    expect(out).toContain("No open positions right now");
    expect(out).not.toContain('href="/careers/');
  });

  it("isn't set up: visitors see that, only admins see why", async () => {
    list.mockResolvedValue({ state: "needs_setup" });
    let out = await html(CareersPage());
    expect(out).toContain("Careers isn&#x27;t set up yet");
    expect(out).not.toContain("For admins");
    isAdmin = true;
    out = await html(CareersPage());
    expect(out).toContain("For admins");
    expect(out).toContain("WonderJobs Admin → Careers");
    list.mockResolvedValue({ state: "unauthorized" });
    expect(await html(CareersPage())).toContain("401");
  });

  it("says it's unavailable and offers to try again", async () => {
    list.mockResolvedValue({ state: "unavailable" });
    const out = await html(CareersPage());
    expect(out).toContain("Careers is unavailable right now");
    expect(out).toContain("Try again");
    expect(out).not.toContain("Product Engineer");
  });
});

describe("/careers/<job id>", () => {
  it("shows the description as text, the JobPosting data and the form with the site's retention", async () => {
    getJob.mockResolvedValue({ state: "ok", data: { job, site: { name: "WonderJobs careers", retentionMonths: 12 } } });
    const out = await html(CareerJobPage({ id: "job_abc123" }));
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain('"@type":"JobPosting"');
    expect(out).toContain("deletes it 12 months after its last update.");
    expect(out).toContain("Share");
    expect(out).toContain('name="website"');
  });

  it("leaves the period out when the site has none", async () => {
    getJob.mockResolvedValue({ state: "ok", data: { job, site: { name: "s", retentionMonths: null } } });
    const out = await html(CareerJobPage({ id: "job_abc123" }));
    expect(out).toContain("for this and similar roles.");
    expect(out).not.toMatch(/deletes it \d+ month/);
    expect(consentText(null)).toBe("I agree that WonderJobs stores my application to consider me for this and similar roles.");
    expect(consentText(6)).toBe("I agree that WonderJobs stores my application to consider me for this and similar roles, and deletes it 6 months after its last update.");
  });

  it("says a closed position is no longer open, with a way back", async () => {
    getJob.mockResolvedValue({ state: "not_found" });
    const out = await html(CareerJobPage({ id: "job_gone" }));
    expect(out).toContain("This position is no longer open");
    expect(out).toContain('href="/careers"');
  });
});

describe("/careers/status", () => {
  it("is never indexed and sends no referrer", async () => {
    expect(statusMetadata.robots).toMatchObject({ index: false });
    expect(statusMetadata.referrer).toBe("no-referrer");
    const rules = await nextConfig.headers!();
    const rule = rules.find((r) => r.source === "/careers/status");
    expect(rule?.headers).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
    // Next applies matching rules in order, so the status page's rule comes after the site-wide one.
    expect(rules.findIndex((r) => r.source === "/careers/status")).toBeGreaterThan(rules.findIndex((r) => r.source === "/:path*"));
  });

  it("shows the status, asking WonderJobs with the token in the body, never in the address", async () => {
    const token = "wjst_" + "x".repeat(40);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ application: { status: "reviewing", statusLabel: "In review", jobTitle: "Product Engineer", company: "WonderJobs", appliedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z", canWithdraw: true } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const out = await html(CareersStatusPage({ searchParams: Promise.resolve({ t: token }) }));
    expect(out).toContain("In review");
    expect(out).toContain("Product Engineer");
    expect(out).toContain("Withdraw");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain(token);
    expect(JSON.parse(String(init.body)).token).toBe(token);
  });

  it("can't find a missing or unknown token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "Application not found." }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    for (const t of [undefined, "", "wjst_" + "u".repeat(40)]) {
      const out = await html(CareersStatusPage({ searchParams: Promise.resolve({ t }) }));
      expect(out).toContain("We couldn&#x27;t find that application. Use the link in your email.");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
