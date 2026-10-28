import { useJobsStore } from "@/store/jobs";
import type { FindMode } from "@/domain/jobs/findMode";

/**
 * Full Time or Part Time on Find (the top bar's menu): that mode's filters, with the Refine settings the candidate
 * last left in it. Each mode shows its own results as they were — nothing is searched: Full Time the profile's,
 * Part Time its last typed search's, or before one a prompt to type (JobsBoard).
 */
export function switchFindMode(m: FindMode) {
  const s = useJobsStore.getState();
  s.switchFindMode(m);
  if (m === "full_time" && s.searchedFor) s.restoreProfileCatalog();
  if (m === "part_time" && !s.searchedFor) s.restoreWordsCatalog();
}
