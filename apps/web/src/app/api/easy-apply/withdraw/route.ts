import { z } from "zod";
import { hiringRoute } from "@/server/hiringRoute";
import { withdrawEasyApply } from "@/server/careers";
import { recordServerAudit } from "@/server/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ applicationId: z.string().regex(/^app_[A-Za-z0-9]{8,40}$/) });

/** The applicant withdraws their own Easy Apply application while the company hasn't moved it on. Audited. */
export async function POST(req: Request) {
  return hiringRoute(
    req,
    async (s, b) => {
      await withdrawEasyApply(s, b.applicationId);
      await recordServerAudit(s.tenantId, { actionId: `easy-apply-withdraw:${b.applicationId}`, actionType: "easy_apply", event: "APPLICATION_WITHDRAWN", detail: b.applicationId });
      return { withdrawn: true };
    },
    { schema: Body, write: true },
  );
}
