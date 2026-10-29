/**
 * Every WonderStar module's own built-in JobsLake sources, beyond Jobs' (docs/WONDERSTAR_PLATFORM.md §8 step 4):
 * one entry per module, so `registry.ts` looks a source's connector up by its module and Jobs' path never changes.
 */
import type { Job } from "@/domain/jobs/types";
import type { Depth } from "@/domain/jobslake/planner";
import type { SearchCriteria } from "@/server/jobs/providers";
import type { ModuleId } from "@/modules/registry";
import { INTERNSHIP_SOURCES, internshipSourceAvailable, runInternshipSource } from "@/server/internships/sources";
import { TEACHING_SOURCES, runTeachingSource, teachingSourceAvailable } from "@/server/teaching/sources";
import { sourceModule } from "./store";
import type { SourceRecord } from "./types";

interface ModuleSources {
  sources: SourceRecord[];
  available: (s: SourceRecord) => boolean;
  run: (s: SourceRecord, c: SearchCriteria, depth: Depth, needsSetup: (m: string) => Error) => Promise<{ jobs: Job[]; warnings: string[] }>;
}

const BY_MODULE: Partial<Record<ModuleId, ModuleSources>> = {
  internships: { sources: INTERNSHIP_SOURCES, available: internshipSourceAvailable, run: runInternshipSource },
  teaching: { sources: TEACHING_SOURCES, available: teachingSourceAvailable, run: runTeachingSource },
};

/** Every module's own built-in sources (each record carries its module). */
export const MODULE_SOURCES: SourceRecord[] = Object.values(BY_MODULE).flatMap((m) => m!.sources);

export function moduleSourceAvailable(s: SourceRecord): boolean {
  return BY_MODULE[sourceModule(s)]?.available(s) ?? false;
}

export async function runModuleSource(s: SourceRecord, c: SearchCriteria, depth: Depth, needsSetup: (m: string) => Error) {
  const m = BY_MODULE[sourceModule(s)];
  if (!m) throw new Error("No connector");
  return m.run(s, c, depth, needsSetup);
}
