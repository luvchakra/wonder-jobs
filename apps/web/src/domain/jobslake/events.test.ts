import { describe, expect, it } from "vitest";
import { normalizePosting, type RawPosting } from "@/services/jobs/normalize";
import { canonicalize } from "./canonical";
import { applyMapping, validateMapping, type ResponseMapping } from "./mapping";
import { validateOpportunity } from "./protocol";

const ev = (over: Partial<RawPosting> = {}): RawPosting => ({ externalId: "e1", title: "flutterCon India", company: "", location: "Bangalore", description: "", applyUrl: "https://fluttercon.example.org/2026", employerSite: false, kind: "event", attributes: { startDate: "2026-11-21", endDate: "2026-11-22", online: false, nested: { x: 1 } as unknown as string }, ...over });
const src = { id: "works_gateway_events", name: "Gateway (events)", provider: "WorksLake Data Gateway", category: "aggregator", accessStrategy: "official_api" } as never;

describe("events in WorksLake", () => {
  it("an event keeps its own fields, names no organiser, and says its date is when it was first seen", () => {
    const j = normalizePosting("works_gateway_events", ev(), Date.parse("2026-11-01T08:00:00Z"));
    expect(j.kind).toBe("event");
    expect(j.company).toBe("");
    expect(j.attributes).toEqual({ startDate: "2026-11-21", endDate: "2026-11-22", online: false });
    expect(j.postedAtFrom).toBe("first_seen");
  });

  it("a job with a real date says it came from the source; one without says first seen", () => {
    const job = (postedAt: string | null) => normalizePosting("x", { externalId: "j", title: "Teacher", company: "School", location: "Pune", description: "Teach", applyUrl: "https://s.example.org/j", employerSite: false, postedAt });
    expect(job("2026-10-30").postedAtFrom).toBe("source");
    expect(job(null).postedAtFrom).toBe("first_seen");
    expect(job(null).company).toBe("School");
    expect(normalizePosting("x", { externalId: "j", title: "T", company: "", location: "", description: "d", applyUrl: "https://s.example.org/j", employerSite: false }).company).toBe("Unknown company");
  });

  it("the validator serves an event without employer or description, but never such a job", () => {
    const { opportunities } = canonicalize([{ job: normalizePosting("works_gateway_events", ev()), source: src }] as never);
    const o = opportunities[0];
    expect(o.kind).toBe("event");
    expect(o.attributes?.startDate).toBe("2026-11-21");
    expect(o.postedAtFrom).toBe("first_seen");
    expect(validateOpportunity(o)).toEqual([]);
    expect(validateOpportunity({ ...o, kind: undefined }).map((i) => i.field).sort()).toEqual(["description", "employer.name"]);
  });

  it("a mapping reads kind and attributes, and an events-only feed passes the employer and date checks", () => {
    const mapping: ResponseMapping = { itemsPath: "items", fields: { sourceJobId: "id", title: "title", employer: "employer", location: "location", description: "description", applyUrl: "applyUrl", postedAt: "postedAt" }, attributesPath: "attributes", kindPath: "kind" };
    const r = applyMapping({ items: [{ id: "1", title: "GAINS", employer: "", location: "Bangalore", description: "", applyUrl: "https://gains.example.org", postedAt: null, kind: "event", attributes: { startDate: "2026-12-09" } }] }, mapping);
    expect(r.items[0].kind).toBe("event");
    expect(r.items[0].attributes).toEqual({ startDate: "2026-12-09" });
    const v = validateMapping(mapping, r);
    expect(v.checks.find((c) => c.label === "Employer identity available")?.ok).toBe(true);
    expect(v.checks.find((c) => c.label === "Posted dates readable")?.ok).toBe(true);
    // A job without an employer still fails.
    const jobs = applyMapping({ items: [{ id: "2", title: "Dev", employer: "", location: "Pune", description: "x", applyUrl: "https://x.example.org", postedAt: "2026-10-30" }] }, mapping);
    expect(validateMapping(mapping, jobs).checks.find((c) => c.label === "Employer identity available")?.ok).toBe(false);
  });
});
