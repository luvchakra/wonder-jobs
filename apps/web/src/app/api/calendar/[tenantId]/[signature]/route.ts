import { NextResponse } from "next/server";
import { verifyTenantCalendarSignature } from "@/server/calendarToken";
import { readClientState } from "@/server/clientState";
import { buildIcsCalendar, type IcsEvent } from "@/server/ics";
import { rateLimit } from "@/server/rateLimit";
import type { Application } from "@/domain/applications/types";
import type { CanonicalJob } from "@/domain/jobs/types";
import type { WorkflowSchedule } from "@/domain/workflow/types";

export const runtime = "nodejs";

interface ApplicationsDoc {
  applications: Record<string, Application>;
}
interface JobsDoc {
  jobs: Record<string, CanonicalJob>;
}
interface WorkflowDoc {
  schedules: Record<string, WorkflowSchedule>;
}

/**
 * Public, cookie-less calendar feed (RFC 5545) — subscribe from Google/Outlook/Apple Calendar via URL.
 * Read-only, real data only: interviews and follow-ups from applications, and each schedule's next run.
 * The URL's signature (server/calendarToken.ts) is the only credential; no session cookie is sent by
 * calendar apps polling this on their own schedule.
 */
export async function GET(req: Request, { params }: { params: Promise<{ tenantId: string; signature: string }> }) {
  const { tenantId, signature } = await params;
  const rl = rateLimit(`calendar:${tenantId}`, { capacity: 30, refillPerSec: 0.2 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!tenantId || !verifyTenantCalendarSignature(tenantId, signature)) {
    return NextResponse.json({ error: "Invalid or expired calendar link" }, { status: 403 });
  }

  const [applicationsDoc, jobsDoc, workflowDoc] = await Promise.all([readClientState<ApplicationsDoc>(tenantId, "wj.applications"), readClientState<JobsDoc>(tenantId, "wj.jobs"), readClientState<WorkflowDoc>(tenantId, "wj.workflow")]);
  const applications = Object.values(applicationsDoc?.applications ?? {});
  const jobs = jobsDoc?.jobs ?? {};
  const schedules = Object.values(workflowDoc?.schedules ?? {});
  const origin = new URL(req.url).origin;

  const events: IcsEvent[] = [];
  for (const a of applications) {
    const job = jobs[a.jobId];
    for (const f of a.followUps) {
      if (f.done) continue;
      const isInterview = f.kind === "interview";
      events.push({
        uid: `followup-${f.id}`,
        start: new Date(f.dueAt),
        durationMinutes: isInterview ? 60 : 15,
        summary: `${isInterview ? "Interview" : f.kind === "thank_you" ? "Thank-you note" : "Follow up"} — ${job?.company ?? "Employer"}`,
        description: `${job?.title ?? "Role"} at ${job?.company ?? "employer"}.${f.note ? ` ${f.note}` : ""}`,
        url: `${origin}/app/applications/${a.id}`,
      });
    }
  }
  for (const s of schedules) {
    if (!s.enabled || !s.nextRunAt) continue;
    events.push({
      uid: `schedule-${s.id}-${s.nextRunAt}`,
      start: new Date(s.nextRunAt),
      durationMinutes: 15,
      summary: `Wonder run: ${s.name}`,
      description: s.description || "Scheduled WonderJobs run.",
      url: `${origin}/app/automation/scheduled/${s.id}`,
    });
  }

  const ics = buildIcsCalendar("WonderJobs", events);
  return new NextResponse(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="wonderjobs.ics"',
      "cache-control": "private, max-age=300",
    },
  });
}
