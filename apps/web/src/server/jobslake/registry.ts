/**
 * The JobsLake source registry (spec §48): built-in sources (today's WonderJobs fetchers, with the
 * combined "careers" source split into its Greenhouse / Lever / Ashby platforms), the partnership
 * catalogue, and admin-added sources. Also resolves each source to the connector that fetches it.
 *
 * A source is only ever Active because a real connection was validated — partnership portals stay
 * "Do not use" until legitimate access exists, and scrapers without established permission are
 * DO_NOT_USE (spec §46–47).
 */
import type { Job } from "@/domain/jobs/types";
import { JOB_SOURCES } from "@/domain/jobs/sources";
import { PROTOCOL_VERSION, type SourceStatus } from "@/domain/jobslake/protocol";
import type { Depth } from "@/domain/jobslake/planner";
import { CAREER_BOARDS, finish, SOURCE_FETCHERS, type SearchCriteria } from "@/server/jobs/providers";
import { fetchAtsBoard, fetchAtsBoards, type AtsBoard } from "./ats";
import { fetchFeed, fetchJsonApi, fetchMcp, fetchStructured } from "./custom";
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
  builtin({ id: "remotive", name: "Remotive", provider: "Remotive", category: "aggregator", accessStrategy: "official_api", geography: ["remote"], legacySourceId: "remotive", capabilities: FEED_CAPS, description: legacyNote("remotive") }),
  builtin({ id: "jobicy", name: "Jobicy", provider: "Jobicy", category: "aggregator", accessStrategy: "official_api", geography: ["remote"], legacySourceId: "jobicy", capabilities: [...FEED_CAPS, "Salary"], description: legacyNote("jobicy") }),
  builtin({ id: "remoteok", name: "Remote OK", provider: "Remote OK", category: "aggregator", accessStrategy: "official_api", geography: ["remote"], legacySourceId: "remoteok", capabilities: FEED_CAPS, description: legacyNote("remoteok") }),
  builtin({ id: "himalayas", name: "Himalayas", provider: "Himalayas", category: "aggregator", accessStrategy: "official_api", geography: ["remote"], legacySourceId: "himalayas", capabilities: FEED_CAPS, description: legacyNote("himalayas") }),
  builtin({ id: "arbeitnow", name: "Arbeitnow", provider: "Arbeitnow", category: "aggregator", accessStrategy: "official_api", geography: ["DE", "remote"], legacySourceId: "arbeitnow", capabilities: FEED_CAPS, description: legacyNote("arbeitnow") }),
  builtin({ id: "adzuna_in", name: "Adzuna India", provider: "Adzuna", category: "aggregator", accessStrategy: "official_api", geography: ["IN"], legacySourceId: "adzuna_in", capabilities: [...FEED_CAPS, "Salary"], secretRef: "env:ADZUNA", description: legacyNote("adzuna_in") }),
];

/** Named for honesty: these exist in the market, and JobsLake says plainly that it can't read them. */
export const PARTNERSHIP_SOURCES: SourceRecord[] = [
  ["linkedin", "LinkedIn"],
  ["indeed", "Indeed"],
  ["naukri", "Naukri"],
  ["foundit", "foundit"],
  ["timesjobs", "TimesJobs"],
].map(([id, name]) =>
  builtin({ id: `partner_${id}`, name, provider: name, category: "portal", accessStrategy: "partner_api", geography: id === "linkedin" || id === "indeed" ? ["global"] : ["IN"], capabilities: [], status: "do_not_use", statusReason: `No public jobs API. Connectable only through a ${name} partnership — until one exists JobsLake doesn't read it.`, config: { kind: "partnership" }, description: `${name} jobs — partnership required.` }),
);

/** Every source JobsLake knows: built-ins (with any admin status override), admin-added, partnership. */
export async function listSources(): Promise<SourceRecord[]> {
  const stored = await jobsLakeStore().listSources();
  const byId = new Map(stored.map((s) => [s.id, s]));
  const builtins = [...BUILTIN_SOURCES, ...PARTNERSHIP_SOURCES].map((b) => {
    const o = byId.get(b.id);
    // Built-ins keep their definition from code; only the admin's status/limits choices and the last test persist.
    return o ? { ...b, status: b.config.kind === "partnership" ? b.status : o.status, statusReason: o.statusReason ?? b.statusReason, limits: o.limits ?? b.limits, updatedAt: o.updatedAt, lastTest: o.lastTest, activatedAt: o.activatedAt } : b;
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
      return s.config.kind === "json_api" ? !s.config.api.credentialHeader || !!(s.secretRef && (await readCredential(s.secretRef))) : !s.config.mcp.credentialHeader || !!(s.secretRef && (await readCredential(s.secretRef)));
    case "scraper":
    case "partnership":
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
      if (cfg.api.credentialHeader && !secret) throw new NeedsSetupError("The API credential is missing.");
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
    case "partnership":
      throw new NeedsSetupError("Partnership required.");
  }
}

/** Statuses an admin may set directly (activation goes through a passing test instead). */
export const ADMIN_SETTABLE: SourceStatus[] = ["paused", "disabled"];
