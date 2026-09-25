import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";
import { requireAdmin } from "@/server/jobslake/access";
import { jobsLakeFlags } from "@/server/jobslake/flags";
import { json } from "@/server/jobslake/http";
import { jobsLakeStore } from "@/server/jobslake/store";

export const runtime = "nodejs";

/**
 * What this deployment's JobsLake is configured to do. Read-only: every switch is an environment
 * variable, so changing one is a deploy-time decision that leaves a trail in the hosting platform.
 * Never returns a secret — only whether one is set.
 */
export async function GET() {
  const a = await requireAdmin();
  if (a instanceof NextResponse) return a;
  const admins = (process.env.JOBSLAKE_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter((e) => e.includes("@"));
  const token = process.env.JOBSLAKE_MCP_TOKEN ?? "";
  return json({
    actor: a.actor,
    flags: jobsLakeFlags(),
    store: await jobsLakeStore().status(),
    access: {
      authConfigured: authConfigured(),
      adminAllowlist: admins.length,
      localAdminMode: !authConfigured() && process.env.JOBSLAKE_LOCAL_ADMIN === "1",
      serviceToken: token.length >= 24 ? "set" : token ? "too_short" : "not_set",
    },
    credentialEncryption: !!(process.env.SECRET_ENCRYPTION_KEY ?? process.env.WONDER_SECRET_KEY),
  });
}
