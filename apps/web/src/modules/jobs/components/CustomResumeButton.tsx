"use client";
import { useState } from "react";
import type { CanonicalJob } from "@/domain/jobs/types";
import { roleFor } from "@/domain/career/roles";
import { profileNameOf } from "@/domain/career/profileName";
import { jobProfile, roleFileLine, useRoleFile } from "@/lib/useRoleFile";
import { useApplicationsStore } from "@/store/applications";
import { useCareerStore } from "@/store/career";
import { ResumeButton } from "@/wonderworks/listing/ResumeButton";

/**
 * Jobs' Generate Customized Resume: WonderWorks' ResumeButton for the job, built from the profile whose search found
 * it (owner, 2026-11-26: "when it generated the custom resume, it still picked the other profile"), else My profile.
 * A role with its own résumé file is that file's person (owner: "for reinsurance the profile picked up should be
 * deepak not Kunal"): the résumé is built from that file alone, with the role's fields over it. With roles, one line
 * names the profile and picks another for the next Re-generate, with the file it's built from under it. Making one
 * puts the job in Pipeline → Preparing.
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
  const file = useRoleFile(role);
  const profile = jobProfile(dna, role, file);
  const fileLine = roleFileLine(file);
  const chooser = roles?.length ? (
    <div className="flex min-w-0 flex-col gap-0.5">
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
      {fileLine && <p className={file.state === "failed" ? "text-[12px] text-danger-600" : "truncate text-[12px] text-ink-3"}>{fileLine}</p>}
    </div>
  ) : undefined;
  return (
    <ResumeButton
      target={job}
      primary={primary}
      profile={profile ?? undefined}
      unavailable={profile ? undefined : file.state === "failed" ? `${file.error} Choose another résumé for ${role?.title ?? "this role"} in Career Profile, or build for another profile.` : `Still reading ${file.state === "reading" ? file.file : "the role's résumé"}. Try again in a moment.`}
      builtFor={role ? { id: role.id, title: role.title } : undefined}
      chooser={chooser}
      onMade={() => useApplicationsStore.getState().startPreparing(job.id, "Customized résumé made")}
    />
  );
}
