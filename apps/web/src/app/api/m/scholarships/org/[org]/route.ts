import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { orgScholarshipApplications, orgScholarships, saveScholarship, setScholarshipStatus } from "@/server/scholarships/applications";
import { can } from "@/domain/org/permissions";
import { membershipOf } from "@/server/hiring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ org: string }> };

const money = z.union([z.number().int().min(0).max(100_000_000), z.literal(""), z.null()]).optional();
const Posting = z.object({
  kind: z.enum(["scholarship", "project"]),
  title: z.string().max(160),
  description: z.string().max(8000),
  location: z.string().max(160).optional(),
  workMode: z.enum(["remote", "hybrid", "onsite"]).optional(),
  skills: z.array(z.string().max(60)).max(25).optional(),
  currency: z.string().length(3),
  deadline: z.string().max(10),
  officialUrl: z.string().max(500),
  levels: z.array(z.enum(["school", "ug", "pg", "phd"])).max(4),
  fields: z.array(z.string().max(60)).max(10).optional(),
  region: z.string().max(120).optional(),
  documents: z.array(z.string().max(120)).max(12).optional(),
  providerType: z.enum(["government", "foundation", "csr", "university", "private"]).optional(),
  awardAmount: money,
  awardPeriod: z.enum(["one_time", "per_year", "per_month"]).optional(),
  renewable: z.boolean().optional(),
  minMarks: money,
  incomeLimit: money,
  gender: z.enum(["female", "male", "other"]).optional(),
  categories: z.array(z.string().max(40)).max(6).optional(),
  stipend: money,
  durationWeeks: money,
  teamSize: money,
  deliverable: z.string().max(300).optional(),
  mentor: z.string().max(160).optional(),
  certificate: z.boolean().optional(),
  questions: z.array(z.object({ id: z.string().max(40).optional(), text: z.string().max(300), required: z.boolean().optional() })).max(5).optional(),
  noFee: z.boolean(),
});

/** The workspace's scholarships and projects, and their applications when the caller's role may view them. */
export async function GET(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, async (s) => {
    const listings = await orgScholarships(s, org);
    const role = (await membershipOf(s, org))?.role;
    return { listings, applications: can(role, "applications.view") ? await orgScholarshipApplications(s, org) : [], role };
  });
}

/** Post a scholarship or project (a draft until opened). Refused if it charges a fee to apply. */
export async function POST(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  return hiringRoute(req, (s, b) => saveScholarship(s, org, b), { schema: Posting, write: true });
}

/** { id, status } opens, closes or returns it to draft; { id, posting } edits it. */
export async function PATCH(req: Request, ctx: Ctx) {
  const { org } = await ctx.params;
  const Body = z.object({ id: z.string().min(1).max(80), status: z.enum(["draft", "open", "closed"]).optional(), posting: Posting.optional() });
  return hiringRoute(req, async (s, b) => (b.posting ? saveScholarship(s, org, b.posting, b.id) : b.status ? setScholarshipStatus(s, org, b.id, b.status) : { ok: false }), { schema: Body, write: true });
}
