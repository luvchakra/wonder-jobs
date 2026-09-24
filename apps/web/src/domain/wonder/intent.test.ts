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

describe("parseWonderIntent — outcome intents (outcome spec §40)", () => {
  it("recognizes today's priorities without stealing the attention question", () => {
    expect(parseWonderIntent("What should I focus on today?").type).toBe("today_priorities");
    expect(parseWonderIntent("summarize today's priorities").type).toBe("today_priorities");
    expect(parseWonderIntent("what needs my attention today").type).toBe("applications_attention");
  });

  it("recognizes application progress", () => {
    expect(parseWonderIntent("Show my application progress").type).toBe("application_progress");
    expect(parseWonderIntent("how are my applications going").type).toBe("application_progress");
    expect(parseWonderIntent("show my applications").type).toBe("application_progress");
  });

  it("recognizes search again and keeps only the candidate's own words as the subject", () => {
    expect(parseWonderIntent("Search again with Director roles")).toEqual({ type: "find_opportunities", subject: "Director roles" });
    expect(parseWonderIntent("find me jobs in fintech")).toEqual({ type: "find_opportunities", subject: "fintech" });
    expect(parseWonderIntent("search again")).toEqual({ type: "find_opportunities", subject: "" });
  });

  it("recurring phrasing still wins over a one-off search", () => {
    expect(parseWonderIntent("search for backend engineer roles every day").type).toBe("create_schedule");
  });

  it("recognizes changing search preferences", () => {
    expect(parseWonderIntent("change my location preferences").type).toBe("change_preferences");
    expect(parseWonderIntent("update my salary").type).toBe("change_preferences");
  });

  it("recognizes explain-a-job and extracts the job subject", () => {
    expect(parseWonderIntent("Why is the Razorpay role a good match?")).toEqual({ type: "explain_job", subject: "the Razorpay role" });
    expect(parseWonderIntent("explain the Google job")).toEqual({ type: "explain_job", subject: "the Google job" });
    expect(parseWonderIntent("why isn't the Google PM role showing").type).toBe("explain_why_not_shown");
  });

  it("recognizes prepare-the-strongest without confusing it with a named job", () => {
    expect(parseWonderIntent("Prepare the strongest two").type).toBe("prepare_strongest");
    expect(parseWonderIntent("prepare applications for my top matches").type).toBe("prepare_strongest");
    expect(parseWonderIntent("prepare an application for Stripe").type).toBe("prepare_application");
  });
});
