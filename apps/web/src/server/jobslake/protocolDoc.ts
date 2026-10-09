import { ACCESS_LABEL, CATEGORY_LABEL, PROTOCOL_VERSION, SEARCH_MODE_META, STATUS_LABEL } from "@/domain/jobslake/protocol";
import { MAPPABLE_FIELDS } from "@/domain/jobslake/mapping";
import { apiPlanConfig } from "@/domain/jobslake/apiPlan";
import { apiSourceIds } from "./developer";
import { MCP_TOOLS } from "./mcp";

/** GET /v1/protocol and the admin Protocols page: the contract, described — no data. */
export function protocolDocument() {
  const plan = apiPlanConfig();
  return {
    name: "JobsLake Protocol",
    version: PROTOCOL_VERSION,
    base: "/api/jobs-lake/v1",
    endpoints: [
      { method: "POST", path: "/search", auth: "WonderJobs session, API key or service token", description: "Search live sources; returns canonical opportunities, per-source outcomes and dedupe counts." },
      { method: "POST", path: "/search/stream", auth: "WonderJobs session, API key or service token", description: "The same search as newline-delimited JSON events, emitted as the work happens." },
      { method: "GET", path: "/opportunities/:id", auth: "WonderJobs session, API key or service token", description: "One canonical opportunity, by JobsLake id or WonderJobs job id." },
      { method: "POST", path: "/opportunities/:id/refresh", auth: "WonderJobs session, API key or service token", description: "Re-read an opportunity from its canonical source." },
      { method: "GET", path: "/sources", auth: "Platform admin or service token", description: "Registered sources with access strategy, status and run-derived health." },
      { method: "GET", path: "/sources/:id", auth: "Platform admin or service token", description: "One source." },
      { method: "POST", path: "/sources/:id/test", auth: "Platform admin or service token", description: "Run a real, validated test fetch." },
      { method: "GET", path: "/health", auth: "Platform admin or service token", description: "Per-source health, computed from recorded runs." },
      { method: "GET", path: "/coverage", auth: "Platform admin or service token", description: "Warm-pool coverage by source, country, role family, seniority, industry, freshness." },
      { method: "GET", path: "/protocol", auth: "Public", description: "This document." },
      { method: "POST", path: "/telemetry", auth: "WonderJobs session or service token", description: "Per-source relevant/strong match counts for a request id. Counts only." },
    ],
    mcp: {
      path: "/api/jobs-lake/mcp",
      transport: "Streamable HTTP (JSON responses)",
      auth: "API key (search_jobs, get_job, refresh_job — metered like REST) or service token (every tool); off unless enabled",
      tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description, apiKey: !t.platform })),
    },
    apiKeys: {
      header: "Authorization: Bearer jl_live_… (or x-api-key: jl_live_…)",
      create: "Account → JobsLake API in WonderJobs. A key is shown once; up to 5 active keys per account.",
      units: "1 per search (REST, stream or MCP search_jobs) and 1 per refresh. Reading an opportunity is free.",
      freePerMonth: plan.freeMonthly,
      overFree: `Past ${plan.freeMonthly} free units a calendar month (UTC): HTTP 402 QUOTA_EXCEEDED, unless the account turned on pay-as-you-go (Stripe, billed per unit at the price shown on the Account page).`,
      rateLimit: "30 requests at once per key, refilling one every 2 seconds (HTTP 429 RATE_LIMITED).",
      sources: apiSourceIds(),
      sourcesNote: "API keys reach only sources whose terms permit redistribution — by default employers' own career boards (ATS). Postings from other sources are never returned to a key.",
      responses: "Source outcomes carry category-level messages only, like WonderJobs' own client.",
    },
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
    errors: ["INVALID_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "RATE_LIMITED", "SOURCE_TIMEOUT", "SOURCE_UNAVAILABLE", "SOURCE_NEEDS_SETUP", "DESTINATION_BLOCKED", "VALIDATION_FAILED", "FEATURE_DISABLED", "QUOTA_EXCEEDED", "INTERNAL"],
  };
}
