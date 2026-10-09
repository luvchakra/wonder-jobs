/**
 * The JobsLake source registry (spec §48): built-in sources (today's WonderJobs fetchers, with the
 * combined "careers" source split into its Greenhouse / Lever / Ashby platforms), the partnership
 * catalogue, and admin-added sources. Also resolves each source to the connector that fetches it.
 *
 * A source is only ever Active because a real connection was validated — partnership portals stay
 * "Do not use" until the partner's endpoint and credential pass a test AND an admin confirms a signed
 * agreement permits the use; scrapers without established permission are DO_NOT_USE (spec §46–47).
 */
import type { Job } from "@/domain/jobs/types";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { PROTOCOL_VERSION, type SourceStatus } from "@/domain/jobslake/protocol";
import { PARTNER_PRESETS, PARTNER_STATUS_REASON } from "@/domain/jobslake/partners";
import type { Depth } from "@/domain/jobslake/planner";
import { CAREER_BOARDS, finish, JAZZHR_COMPANIES, SMARTRECRUITERS_COMPANIES, SOURCE_FETCHERS, type SearchCriteria } from "@/server/jobs/providers";
import { fetchAtsBoard, fetchAtsBoards, type AtsBoard } from "./ats";
import { fetchFeed, fetchJsonApi, fetchMcp, fetchPartner, fetchStructured } from "./custom";
import { readCredential } from "./credentials";
import { jobsLakeStore } from "./store";
import { DEFAULT_LIMITS, type SourceRecord } from "./types";

const EPOCH = "2026-09-24T00:00:00.000Z";
const ATS_CAPS = ["Search", "Job details", "Freshness", "Employer identity", "Apply URL"];
const FEED_CAPS = ["Search", "Freshness", "Apply URL"];

function builtin(p: Pick<SourceRecord, "id" | "name" | "provider" | "category" | "accessStrategy" | "geography" | "description" | "capabilities"> & Partial<SourceRecord>): SourceRecord {
  return { protocolVersion: PROTOCOL_VERSION, status: "active", roleFamilies: [], config: { kind: "builtin" }, limits: DEFAULT_LIMITS, builtin: true, createdAt: EPOCH, updatedAt: EPOCH, ...p };
}

const boardsOf = (ats: "greenhouse" | "lever" | "ashby"): AtsBoard[] => CAREER_BOARDS.filter((b) => b.ats === ats).map((b) => ({ platform: b.ats, slug: b.slug, company: b.company, domain: b.domain }));
const companies = (ats: "greenhouse" | "lever" | "ashby") => boardsOf(ats).map((b) => b.company).join(", ");
const legacyNote = (id: string) => JOB_SOURCES.find((s) => s.id === id)?.note ?? "";

export const BUILTIN_SOURCES: SourceRecord[] = [
  builtin({ id: "greenhouse", name: "Greenhouse", provider: "Greenhouse", category: "ats", accessStrategy: "official_api", geography: ["global"], legacySourceId: "careers", capabilities: ATS_CAPS, description: `Greenhouse Job Board API — career sites of ${companies("greenhouse")}.` }),
  builtin({ id: "lever", name: "Lever", provider: "Lever", category: "ats", accessStrategy: "official_api", geography: ["global"], legacySourceId: "careers", capabilities: ATS_CAPS, description: `Lever Postings API — career sites of ${companies("lever")}.` }),
  builtin({ id: "ashby", name: "Ashby", provider: "Ashby", category: "ats", accessStrategy: "official_api", geography: ["global"], legacySourceId: "careers", capabilities: ATS_CAPS, description: `Ashby Job Posting API — career sites of ${companies("ashby")}.` }),
  builtin({ id: "smartrecruiters", name: "SmartRecruiters career sites", provider: "SmartRecruiters", category: "ats", accessStrategy: "official_api", geography: ["IN", "global"], legacySourceId: "smartrecruiters", capabilities: ATS_CAPS, description: `SmartRecruiters public Posting API — career sites of ${SMARTRECRUITERS_COMPANIES.map((c) => c.company).join(", ")}.` }),
  builtin({ id: "jazzhr", name: "JazzHR career sites", provider: "JazzHR", category: "ats", accessStrategy: "official_api", geography: ["IN", "global", "remote"], legacySourceId: "jazzhr", capabilities: ATS_CAPS, description: `JazzHR public job feed — career sites of ${JAZZHR_COMPANIES.join(", ")}.` }),
  builtin({ id: "themuse", name: "The Muse", provider: "The Muse", category: "aggregator", accessStrategy: "official_api", geography: ["global", "IN"], legacySourceId: "themuse", capabilities: FEED_CAPS, description: legacyNote("themuse") }),
  builtin({ id: "remotive", name: "Remotive", provider: "Remotive", category: "aggregator", accessStrategy: "official_api", geography: ["remote"], legacySourceId: "remotive", capabilities: FEED_CAPS, description: legacyNote("remotive") }),
  builtin({ id: "jobicy", name: "Jobicy", provider: "Jobicy", category: "aggregator", accessStrategy: "official_api", geography: ["remote"], legacySourceId: "jobicy", capabilities: [...FEED_CAPS, "Salary"], description: legacyNote("jobicy") }),
  builtin({ id: "remoteok", name: "Remote OK", provider: "Remote OK", category: "aggregator", accessStrategy: "official_api", geography: ["remote"], legacySourceId: "remoteok", capabilities: FEED_CAPS, description: legacyNote("remoteok") }),
  builtin({ id: "himalayas", name: "Himalayas", provider: "Himalayas", category: "aggregator", accessStrategy: "official_api", geography: ["remote"], legacySourceId: "himalayas", capabilities: FEED_CAPS, description: legacyNote("himalayas") }),
  builtin({ id: "arbeitnow", name: "Arbeitnow", provider: "Arbeitnow", category: "aggregator", accessStrategy: "official_api", geography: ["DE", "remote"], legacySourceId: "arbeitnow", capabilities: FEED_CAPS, description: legacyNote("arbeitnow") }),
  builtin({ id: "adzuna_in", name: "Adzuna India", provider: "Adzuna", category: "aggregator", accessStrategy: "official_api", geography: ["IN"], legacySourceId: "adzuna_in", capabilities: [...FEED_CAPS, "Salary"], secretRef: "env:ADZUNA", description: legacyNote("adzuna_in") }),
];

/**
 * The partner portals. None has an open job-search API: each stays "Do not use" until its
 * partnership hands over an endpoint and credential, a test passes, and an admin confirms the
 * signed agreement at activation (admin.ts). Until then JobsLake doesn't read it — and never scrapes it.
 */
export const PARTNERSHIP_SOURCES: SourceRecord[] = PARTNER_PRESETS.map((p) =>
  builtin({ id: `partner_${p.id}`, name: p.name, provider: p.name, category: "portal", accessStrategy: "partner_api", geography: p.geography, capabilities: ["Search", "Apply URL"], status: "do_not_use", statusReason: PARTNER_STATUS_REASON, config: { kind: "partnership", partner: p.id }, description: `${p.name} jobs through a ${p.name} partnership or data-licensing agreement.` }),
);

/** Every source JobsLake knows: built-ins (with any admin status override), admin-added, partnership. */
export async function listSources(): Promise<SourceRecord[]> {
  const stored = await jobsLakeStore().listSources();
  const byId = new Map(stored.map((s) => [s.id, s]));
  const builtins = [...BUILTIN_SOURCES, ...PARTNERSHIP_SOURCES].map((b) => {
    const o = byId.get(b.id);
    if (!o) return b;
    // Built-ins keep their definition from code; only the admin's status/limits choices and the last test persist.
    const kept = { ...b, statusReason: o.statusReason ?? b.statusReason, limits: o.limits ?? b.limits, updatedAt: o.updatedAt, lastTest: o.lastTest, activatedAt: o.activatedAt };
    if (b.config.kind !== "partnership") return { ...kept, status: o.status };
    // A partner portal also keeps the connection its partnership handed over, its credential ref and
    // the agreement record. Fail closed: no connection, or "active" without an agreement, is Do not use.
    const connection = o.config.kind === "partnership" ? o.config.connection : undefined;
    const live = o.status === "active" || o.status === "degraded";
    const status: SourceStatus = connection && (!live || o.agreement) ? o.status : "do_not_use";
    return { ...kept, config: { ...b.config, connection }, secretRef: o.secretRef, agreement: o.agreement, status, statusReason: status === "do_not_use" ? PARTNER_STATUS_REASON : o.statusReason };
  });
  const added = stored.filter((s) => !s.builtin);
  return [...builtins, ...added];
}

export async function getSource(id: string): Promise<SourceRecord | undefined> {
  return (await listSources()).find((s) => s.id === id);
}

/** Whether this deployment can actually query the source right now (credentials present, connector exists). */
export async function isAvailable(s: SourceRecord): Promise<boolean> {
  switch (s.config.kind) {
    case "builtin":
      return ["greenhouse", "lever", "ashby"].includes(s.id) || (SOURCE_FETCHERS[s.id]?.available() ?? false);
    case "ats_board":
    case "feed":
    case "structured":
      return true;
    case "json_api":
    case "mcp":
      return s.config.kind === "json_api" ? !(s.config.api.credentialHeader || s.config.api.auth) || !!(s.secretRef && (await readCredential(s.secretRef))) : !s.config.mcp.credentialHeader || !!(s.secretRef && (await readCredential(s.secretRef)));
    case "partnership":
      return !!s.config.connection && !!(s.secretRef && (await readCredential(s.secretRef)));
    case "scraper":
      return false;
  }
}

export class NeedsSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NeedsSetupError";
  }
}

export interface ConnectorResult {
  jobs: Job[];
  /** Partial problems that didn't fail the source (e.g. one board of many). */
  warnings: string[];
  sample?: unknown;
  mapping?: import("@/domain/jobslake/mapping").MappingResult;
}

/**
 * Fetch one source. Throws NeedsSetupError for missing credentials; any other throw is the source
 * being unavailable. Every job carries the source's own id (or its legacy WonderJobs id for ATS and
 * built-ins, so existing job ids never change).
 */
export async function runConnector(s: SourceRecord, c: SearchCriteria, depth: Depth): Promise<ConnectorResult> {
  const cfg = s.config;
  switch (cfg.kind) {
    case "builtin": {
      if (s.id === "greenhouse" || s.id === "lever" || s.id === "ashby") {
        const r = await fetchAtsBoards(boardsOf(s.id), c, depth);
        return { jobs: r.jobs, warnings: r.failures.map((f) => `${f.slug}: ${f.message}`) };
      }
      const f = SOURCE_FETCHERS[s.id];
      if (!f) throw new Error("No connector");
      if (!f.available()) throw new NeedsSetupError(`${s.name} needs credentials on this deployment.`);
      return { jobs: await f.fetch(c), warnings: [] };
    }
    case "ats_board":
      return { jobs: await fetchAtsBoard({ platform: cfg.platform, slug: cfg.slug, company: cfg.company, domain: cfg.domain }, c, depth), warnings: [] };
    case "json_api": {
      const secret = await readCredential(s.secretRef);
      if ((cfg.api.credentialHeader || cfg.api.auth) && !secret) throw new NeedsSetupError("The API credential is missing.");
      const r = await fetchJsonApi(cfg.api, c, secret, s.limits.timeoutMs);
      return { jobs: finish(s.id, r.raws, c).slice(0, s.limits.maxResults), warnings: [], sample: r.sample, mapping: r.mapping };
    }
    case "feed": {
      const r = await fetchFeed(cfg.feed, s.limits.timeoutMs);
      return { jobs: finish(s.id, r.raws, c).slice(0, s.limits.maxResults), warnings: [], sample: r.sample };
    }
    case "structured": {
      const r = await fetchStructured(cfg.page, s.limits.timeoutMs);
      return { jobs: finish(s.id, r.raws, c).slice(0, s.limits.maxResults), warnings: [], sample: r.sample };
    }
    case "mcp": {
      const secret = await readCredential(s.secretRef);
      if (cfg.mcp.credentialHeader && !secret) throw new NeedsSetupError("The MCP server credential is missing.");
      const r = await fetchMcp(cfg.mcp, c, secret, s.limits.timeoutMs);
      return { jobs: finish(s.id, r.raws, c).slice(0, s.limits.maxResults), warnings: [], sample: r.sample, mapping: r.mapping };
    }
    case "scraper":
      throw new NeedsSetupError("No scraper engine is enabled on this deployment. Scraped sources can't be activated.");
    case "partnership": {
      if (!cfg.connection) throw new NeedsSetupError(`${PARTNER_STATUS_REASON}.`);
      const secret = await readCredential(s.secretRef);
      if (!secret) throw new NeedsSetupError("The partner credential is missing.");
      const r = await fetchPartner(cfg.connection, c, secret, s.limits.timeoutMs);
      return { jobs: finish(s.id, r.raws, c).slice(0, s.limits.maxResults), warnings: [], sample: r.sample, mapping: r.mapping };
    }
  }
}

/** Statuses an admin may set directly (activation goes through a passing test instead). */
export const ADMIN_SETTABLE: SourceStatus[] = ["paused", "disabled"];
