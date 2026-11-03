import type { ModuleId } from "@/wonderworks/manifest";

/** The ways Admin → Add a source can connect a site (owner, 2026-11-02: "redesign this page based on what we have today"). */
export type SourceKind = "ats_board" | "json_api" | "mcp" | "feed" | "structured" | "scraper";

/**
 * Modules whose listings are job postings. Only they take an ATS board or a schema.org JobPosting page: those connectors
 * read job postings and nothing else, so offering them to Events or Buy, Sell & Rent would add a source that never finds a listing.
 */
export const JOB_POSTING_MODULES: readonly ModuleId[] = ["jobs", "internships", "teaching"];

const JOB_ONLY: readonly SourceKind[] = ["ats_board", "structured"];

/** Whether a module can take a source of this kind. */
export const kindFitsModule = (kind: SourceKind, module: ModuleId): boolean => !JOB_ONLY.includes(kind) || JOB_POSTING_MODULES.includes(module);
