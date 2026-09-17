"use client";
import Link from "next/link";
import { FileText } from "lucide-react";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/States";
import { Badge } from "@/components/common/Badge";
import { PROVENANCE_META } from "@/domain/workflow/resolve";
import { formatDate } from "@/lib/format";

export default function ResumeStudioPage() {
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const items = Object.values(applications)
    .flatMap((a) => a.artifacts.filter((x) => x.type === "resume").map((x) => ({ app: a, artifact: x })))
    .sort((a, b) => b.artifact.versions[b.artifact.versions.length - 1].createdAt.localeCompare(a.artifact.versions[a.artifact.versions.length - 1].createdAt));
  return (
    <div>
      <PageHeader title="Resume Studio" description="Every tailored resume Wonder has drafted, with full version history. Edit any of them from its application." />
      {items.length === 0 ? (
        <EmptyState icon={<FileText className="size-5" aria-hidden />} title="No tailored resumes yet" body="Prepare an application and Wonder will draft a resume for that role." action={{ label: "Go to applications", href: "/app/applications" }} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map(({ app, artifact }) => {
            const job = jobs[app.jobId];
            const cur = artifact.versions.find((v) => v.id === artifact.currentVersionId) ?? artifact.versions[0];
            return (
              <li key={artifact.id}>
                <Link href={`/app/applications/${app.id}/prepare`} className="wj-card wj-elevate flex h-full flex-col p-4">
                  <span className="text-[14px] font-semibold text-ink">{job?.title ?? "Role"}</span>
                  <span className="text-[13px] text-ink-3">{job?.company}</span>
                  <p className="mt-3 line-clamp-4 whitespace-pre-line text-[12px] text-ink-3">{cur.content}</p>
                  <span className="mt-3 flex items-center gap-2 text-[11px] text-ink-4">
                    <Badge tone={PROVENANCE_META[cur.provenance].tone}>{PROVENANCE_META[cur.provenance].label}</Badge>
                    {artifact.versions.length} version{artifact.versions.length === 1 ? "" : "s"} · {formatDate(cur.createdAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
