import { JOB_SOURCES } from "@/domain/jobs/sources";
import { SOURCE_FETCHERS } from "./providers";

/**
 * Which sources this deployment can query right now. Searching itself goes only through JobsLake
 * (owner, 2026-10-17): there is no direct per-source search path any more.
 */
export function sourceAvailability(): Record<string, boolean> {
  return Object.fromEntries(JOB_SOURCES.map((s) => [s.id, SOURCE_FETCHERS[s.id]?.available() ?? false]));
}
