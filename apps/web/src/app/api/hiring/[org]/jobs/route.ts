import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { listOrgJobs, saveJob, setJobStatus } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

const Job = z.object({
  title: z.string().max(140),
  location: z.string().max(120),
  workMode: z.enum(["remote", "hybrid", "onsite"]),
  jobType: z.enum(["full_time", "part_time", "contract", "internship", "temporary", "gig"]).optional(),
  salaryMin: z.number().int().min(0).max(1_000_000_000).optional(),
  salaryMax: z.number().int().min(0).max(1_000_000_000).optional(),
  currency: z.string().length(3).optional(),
  description: z.string().max(8000),
  skills: z.array(z.string().max(60)).max(25).optional(),
  applyUrl: z.string().max(500),
});

export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, async (s) => ({ jobs: await listOrgJobs(s, org) }));
}

export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s, b) => saveJob(s, org, b), { schema: Job, write: true });
}

/** { id, status } opens, closes or returns a job to draft; { id, job } edits it. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ id: z.string().min(1).max(80), status: z.enum(["draft", "open", "closed"]).optional(), job: Job.optional() });
  return hiringRoute(req, async (s, b) => (b.job ? saveJob(s, org, b.job, b.id) : b.status ? setJobStatus(s, org, b.id, b.status) : { ok: false }), { schema: Body, write: true });
}
