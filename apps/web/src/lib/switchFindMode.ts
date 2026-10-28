import { useJobsStore } from "@/store/jobs";
import { isWordsMode, type FindMode } from "@/domain/jobs/findMode";

/**
 * Full Time, Part Time or Internships on Find (the top bar's menu): that mode's filters, with the Refine settings the
 * candidate last left in it. Each mode shows its own results as they were — nothing is searched: Full Time the
 * profile's, Part Time and Internships the last typed search's (they share it; Internships lists only its
 * internships, and asks for words when that search wasn't for internships — JobsBoard).
 */
export function switchFindMode(m: FindMode) {
  const s = useJobsStore.getState();
  s.switchFindMode(m);
  if (m === "full_time" && s.searchedFor) s.restoreProfileCatalog();
  if (isWordsMode(m) && !s.searchedFor) s.restoreWordsCatalog();
}
