"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApplicationsStore } from "@/store/applications";
import { PageLoading } from "@/components/common/States";

/**
 * Interview prep lives on each application now (Pipeline → Interview → Prepare). Older notifications
 * still link here: open the soonest upcoming interview's prep, or the Pipeline when there's none.
 */
export default function InterviewPrepRedirect() {
  const router = useRouter();
  const applications = useApplicationsStore((s) => s.applications);
  useEffect(() => {
    const next = Object.values(applications)
      .flatMap((a) => a.followUps.filter((f) => f.kind === "interview" && !f.done).map((f) => ({ id: a.id, at: f.dueAt })))
      .sort((x, y) => x.at.localeCompare(y.at))[0];
    router.replace(next ? `/app/applications/${next.id}/interview` : "/app/applications");
  }, [applications, router]);
  return <PageLoading />;
}
