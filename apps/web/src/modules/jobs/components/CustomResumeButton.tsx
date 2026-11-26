"use client";
import { useState } from "react";
import type { CanonicalJob } from "@/domain/jobs/types";
import { roleFor } from "@/domain/career/roles";
import { draftingProfile } from "@/domain/career/profiles";
import { profileNameOf } from "@/domain/career/profileName";
import { useApplicationsStore } from "@/store/applications";
import { useCareerStore } from "@/store/career";
import { ResumeButton } from "@/wonderworks/listing/ResumeButton";

/**
 * Jobs' Generate Customized Resume: WonderWorks' ResumeButton for the job, built from the profile whose search found
 * it (owner, 2026-11-26: "when it generated the custom resume, it still picked the other profile"), else My profile.
 * With roles, one line names that profile and picks another for the next Re-generate. Making one puts the job in
 * Pipeline → Preparing.
 */
export function CustomResumeButton({ job, primary = false }: { job: CanonicalJob; primary?: boolean }) {
  const dna = useCareerStore((s) => s.dna);
  const roles = useCareerStore((s) => s.roles);
  const made = useCareerStore((s) => s.savedResumes.find((r) => r.target?.jobId === job.id));
  // The profile last built from for this job, else the one whose search found it; "" is My profile.
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const start = made ? (made.target?.builtFor?.id ?? "") : (job.foundAs?.id ?? "");
  const id = picked ?? start;
  const role = id ? roleFor(roles, { id, title: "" }) : undefined;
  const chooser = roles?.length ? (
    <label className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
      Built for
      <select value={role?.id ?? ""} onChange={(e) => setPicked(e.target.value)} className="min-w-0 truncate rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] font-medium text-ink" aria-label="Profile the résumé is built for">
        <option value="">{profileNameOf(dna)}</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </select>
    </label>
  ) : undefined;
  return <ResumeButton target={job} primary={primary} profile={draftingProfile(dna, role)} builtFor={role ? { id: role.id, title: role.title } : undefined} chooser={chooser} onMade={() => useApplicationsStore.getState().startPreparing(job.id, "Customized résumé made")} />;
}
