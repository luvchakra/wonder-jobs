import { describe, expect, it } from "vitest";
import { parseWonderIntent } from "./intent";

describe("parseWonderIntent — deterministic, no model call", () => {
  it("empty input is a blank job search, never an error", () => {
    expect(parseWonderIntent("")).toEqual({ type: "search_jobs", subject: "" });
    expect(parseWonderIntent("   ")).toEqual({ type: "search_jobs", subject: "" });
  });

  it("recognizes missing-skills questions", () => {
    expect(parseWonderIntent("what skills am I missing").type).toBe("missing_skills");
    expect(parseWonderIntent("what skills do I need for these roles").type).toBe("missing_skills");
    expect(parseWonderIntent("skills I lack").type).toBe("missing_skills");
  });

  it("recognizes applications-needing-attention questions", () => {
    expect(parseWonderIntent("what applications need my attention").type).toBe("applications_attention");
    expect(parseWonderIntent("which applications need attention").type).toBe("applications_attention");
    expect(parseWonderIntent("what needs my attention today").type).toBe("applications_attention");
  });

  it("recognizes a LinkedIn/headline improvement request without fabricating a LinkedIn feature", () => {
    expect(parseWonderIntent("improve my linkedin headline").type).toBe("career_headline");
    expect(parseWonderIntent("help me write a better headline").type).toBe("career_headline");
  });

  it("recognizes recurring/schedule phrasing and extracts the real search text as subject", () => {
    const r = parseWonderIntent("search for backend engineer roles every day");
    expect(r.type).toBe("create_schedule");
    expect(r.subject).toBe("backend engineer roles");

    const r2 = parseWonderIntent("create a schedule to find product manager jobs weekly");
    expect(r2.type).toBe("create_schedule");
    expect(r2.subject.toLowerCase()).toContain("product manager");
  });

  it("recognizes why-not-shown questions and extracts the subject", () => {
    const r = parseWonderIntent("why isn't the Google PM role showing");
    expect(r.type).toBe("explain_why_not_shown");
    expect(r.subject).toBe("the Google PM role");

    const r2 = parseWonderIntent("why can't I see the Stripe job");
    expect(r2.type).toBe("explain_why_not_shown");
    expect(r2.subject).toBe("the Stripe job");
  });

  it("recognizes prepare-application requests and extracts the company/title", () => {
    const r = parseWonderIntent("prepare an application for Stripe");
    expect(r.type).toBe("prepare_application");
    expect(r.subject).toBe("Stripe");

    const r2 = parseWonderIntent("start my resume for the Amazon role");
    expect(r2.type).toBe("prepare_application");
    expect(r2.subject).toBe("the Amazon role");
  });

  it("falls back to search_jobs for anything else, preserving the existing command-palette behavior", () => {
    expect(parseWonderIntent("product manager jobs in Bengaluru")).toEqual({ type: "search_jobs", subject: "product manager jobs in Bengaluru" });
    expect(parseWonderIntent("remote React roles").type).toBe("search_jobs");
  });
});
