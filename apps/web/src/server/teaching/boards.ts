/**
 * School, university and online-teaching boards on Recruitee and Personio, two applicant-tracking systems whose
 * published jobs are public with no key (Recruitee `/api/offers/`, Personio `/xml`). The connectors are shared
 * (`server/jobslake/recruitee.ts`, `personio.ts`); Teaching lists only the boards it has checked, and keeps only posts
 * whose title says they are teaching posts.
 *
 * Checked live 2026-11-05: each board answers and has teaching-titled posts. A board that later fails is skipped, so a
 * stale entry costs nothing. Add more by finding the school's own board address (`{slug}.recruitee.com`,
 * `{slug}.jobs.personio.de`); never add one you haven't opened.
 */
import type { Job } from "@/domain/jobs/types";
import type { SearchCriteria } from "@/server/jobs/providers";
import { fetchPersonio } from "@/server/jobslake/personio";
import { fetchRecruitee } from "@/server/jobslake/recruitee";
import { isTeachingTitle } from "@/modules/teaching/domain";

/** A board's domain is for its logo; empty where the school's own site couldn't be confirmed (the logo falls back to its initial). */
export const TEACHING_RECRUITEE_BOARDS = [
  { slug: "berlinmetropolitanschool", company: "Berlin Metropolitan School", domain: "" },
  { slug: "novakidteachers", company: "Novakid", domain: "novakid.com" },
  { slug: "brighterly", company: "Brighterly", domain: "brighterly.com" },
];

export const TEACHING_PERSONIO_BOARDS = [
  { slug: "bis", company: "Bavarian International School", domain: "bis-school.com" },
  { slug: "bbis", company: "Berlin Brandenburg International School", domain: "bbis.de" },
  { slug: "schiller-international-university", company: "Schiller International University", domain: "schiller.edu" },
];

export const fetchTeachingRecruitee = (sourceId: string, c: SearchCriteria): Promise<Job[]> => fetchRecruitee(sourceId, c, (o) => isTeachingTitle(o.title), TEACHING_RECRUITEE_BOARDS);
export const fetchTeachingPersonio = (sourceId: string, c: SearchCriteria): Promise<Job[]> => fetchPersonio(sourceId, c, (p) => isTeachingTitle(p.name), TEACHING_PERSONIO_BOARDS);
