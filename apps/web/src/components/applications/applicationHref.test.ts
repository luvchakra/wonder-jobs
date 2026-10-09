import { describe, expect, it } from "vitest";
import { HANDOFF_TITLES, handedOffAt } from "@/domain/applications/types";
import { applicationHref } from "./ApplicationCard";

const ev = (title: string) => ({ id: "e", applicationId: "app_1", type: "note" as const, at: "2026-10-09T08:00:00Z", title });

describe("where an application's card leads", () => {
  it("goes back to Apply with Wonder once the employer's form was opened, to the Application Pack before that", () => {
    const base = { id: "app_1", jobId: "job_1", status: "preparing" as const };
    expect(applicationHref({ ...base, events: [] })).toBe("/app/applications/app_1/prepare");
    expect(applicationHref({ ...base, events: [ev(HANDOFF_TITLES.helper)] })).toBe("/app/jobs/job_1/apply");
    expect(applicationHref({ ...base, events: [ev(HANDOFF_TITLES.guided)] })).toBe("/app/jobs/job_1/apply");
    expect(applicationHref({ ...base, status: "submitted", events: [ev(HANDOFF_TITLES.helper)] })).toBe("/app/applications/app_1");
    expect(handedOffAt({ events: [ev("Something else")] })).toBeUndefined();
  });
});
