import { ACCESS_LABEL, CATEGORY_LABEL, PROTOCOL_VERSION, SEARCH_MODE_META, STATUS_LABEL } from "@/domain/jobslake/protocol";
import { MAPPABLE_FIELDS } from "@/domain/jobslake/mapping";
import { MCP_TOOLS } from "./mcp";

/** GET /v1/protocol and the admin Protocols page: the contract, described — no data. */
export function protocolDocument() {
  return {
    name: "JobsLake Protocol",
    version: PROTOCOL_VERSION,
    base: "/api/jobs-lake/v1",
    endpoints: [
      { method: "POST", path: "/search", auth: "WonderJobs session or service token", description: "Search live sources; returns canonical opportunities, per-source outcomes and dedupe counts." },
      { method: "POST", path: "/search/stream", auth: "WonderJobs session or service token", description: "The same search as newline-delimited JSON events, emitted as the work happens." },
      { method: "GET", path: "/opportunities/:id", auth: "WonderJobs session or service token", description: "One canonical opportunity, by JobsLake id or WonderJobs job id." },
      { method: "POST", path: "/opportunities/:id/refresh", auth: "WonderJobs session or service token", description: "Re-read an opportunity from its canonical source." },
      { method: "GET", path: "/sources", auth: "Platform admin or service token", description: "Registered sources with access strategy, status and run-derived health." },
      { method: "GET", path: "/sources/:id", auth: "Platform admin or service token", description: "One source." },
      { method: "POST", path: "/sources/:id/test", auth: "Platform admin or service token", description: "Run a real, validated test fetch." },
      { method: "GET", path: "/health", auth: "Platform admin or service token", description: "Per-source health, computed from recorded runs." },
      { method: "GET", path: "/coverage", auth: "Platform admin or service token", description: "Warm-pool coverage by source, country, role family, seniority, industry, freshness." },
      { method: "GET", path: "/protocol", auth: "Public", description: "This document." },
      { method: "POST", path: "/telemetry", auth: "WonderJobs session or service token", description: "Per-source relevant/strong match counts for a request id. Counts only." },
    ],
    mcp: { path: "/api/jobs-lake/mcp", transport: "Streamable HTTP (JSON responses)", auth: "Service token; off unless enabled", tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })) },
    searchRequest: {
      required: ["query.text or query.titles[0]"],
      fields: ["query.text", "query.titles", "query.skills", "query.locations", "query.seniority", "filters.freshnessDays", "filters.workplaceTypes", "sourceIds", "searchMode", "limit", "correlationId"],
      note: "Only what's needed to search. Never résumé text, notes or AI reasoning.",
    },
    searchModes: SEARCH_MODE_META,
    events: ["search_started", "source_started", "source_completed", "jobs_retrieved", "dedupe_progress", "search_completed", "error"],
    sourceOutcomes: { ok: "Answered with jobs", empty: "Answered, nothing matched", needs_setup: "Needs credentials or setup", timeout: "Didn't answer in time", unavailable: "Failed", skipped: "Not asked (status, fit or enough results)" },
    opportunityFields: ["id", "protocolVersion", "employer", "title", "normalizedTitle", "locations", "country", "workplaceType", "compensation", "description", "requirements", "niceToHave", "skills", "enrichment (derived)", "postedAt", "canonicalApplyUrl", "applyPath", "sourceRecords", "provenance", "quality", "freshness"],
    authority: ["Employer career site / ATS", "Licensed or partner feed", "Job portal, government, specialist board", "Aggregator"],
    accessStrategies: ACCESS_LABEL,
    categories: CATEGORY_LABEL,
    statuses: STATUS_LABEL,
    mappableFields: MAPPABLE_FIELDS,
    errors: ["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "RATE_LIMITED", "SOURCE_TIMEOUT", "SOURCE_UNAVAILABLE", "SOURCE_NEEDS_SETUP", "DESTINATION_BLOCKED", "VALIDATION_FAILED", "FEATURE_DISABLED", "INTERNAL"],
  };
}
