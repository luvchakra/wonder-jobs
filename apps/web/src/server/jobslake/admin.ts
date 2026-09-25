/**
 * JobsLake admin operations (spec §21–28, §49, §94): add, configure, test, activate, pause and
 * remove sources; manage their credentials; run playground searches. Every change is audited.
 *
 * Rules enforced here, not just in the UI:
 * - a source becomes Active only through `activateSource`, which needs a passing test in the last
 *   24 hours — never for partnership portals or scrapers;
 * - every URL an admin enters is checked against the SSRF policy before it's stored;
 * - a credential is write-only: stored encrypted, reported masked, never returned.
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ATS_META, detectSource, type AtsPlatform, type Detection } from "@/domain/jobslake/detect";
import type { MappingResult } from "@/domain/jobslake/mapping";
import { PROTOCOL_VERSION, type SearchRequest, type SourceStatus } from "@/domain/jobslake/protocol";
import { checkDestination } from "@/domain/jobslake/ssrf";
import { audit, search, testSource } from "./core";
import { credentialStatus, deleteCredential, saveCredential } from "./credentials";
import { ADMIN_SETTABLE, getSource, runConnector } from "./registry";
import { err, type Result } from "./service";
import { jobsLakeStore } from "./store";
import { DEFAULT_LIMITS, type SourceConfig, type SourceRecord, type TestReport } from "./types";

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const ACTIVATION_WINDOW_MS = 24 * 3_600_000;

/* ---------------------------------------------------------------- schemas */

const text = (max: number) => z.string().trim().min(1).max(max);
const path = z.string().trim().max(200);
const Mapping = z.object({
  itemsPath: path,
  fields: z.partialRecord(z.enum(["sourceJobId", "title", "employer", "location", "description", "applyUrl", "postedAt", "salaryMin", "salaryMax", "currency", "remote"]), path),
  defaultEmployer: z.string().trim().max(120).optional(),
});
const header = z.string().trim().regex(/^[A-Za-z0-9-]{1,60}$/, "Header names are letters, digits and dashes");
const param = z.string().trim().regex(/^[A-Za-z0-9_.-]{1,60}$/);

const ConfigInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ats_board"), platform: z.enum(["greenhouse", "lever", "ashby", "smartrecruiters", "workable"]), slug: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/), company: text(120), domain: z.string().trim().max(120).optional() }),
  z.object({ kind: z.literal("json_api"), api: z.object({ endpoint: text(500), queryParam: param.optional(), locationParam: param.optional(), credentialHeader: header.optional(), credentialPrefix: z.string().max(20).optional(), mapping: Mapping }) }),
  z.object({ kind: z.literal("feed"), feed: z.object({ url: text(500), defaultEmployer: z.string().trim().max(120).optional() }) }),
  z.object({ kind: z.literal("structured"), page: z.object({ url: text(500) }) }),
  z.object({ kind: z.literal("mcp"), mcp: z.object({ endpoint: text(500), toolName: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/), queryArgument: param, locationArgument: param.optional(), credentialHeader: header.optional(), credentialPrefix: z.string().max(20).optional(), mapping: Mapping }) }),
  z.object({
    kind: z.literal("scraper"),
    governance: z.object({
      permission: z.enum(["granted_in_writing", "terms_permit", "not_established", "denied"]),
      termsReviewed: z.boolean(),
      robotsReviewed: z.boolean(),
      crawlDelaySec: z.number().int().min(1).max(3600),
      maxConcurrency: z.number().int().min(1).max(4),
      failureThreshold: z.number().int().min(1).max(50),
      retentionDays: z.number().int().min(1).max(365),
      attribution: z.string().trim().max(200),
      canonicalSourceUrl: text(500),
      notes: z.string().max(1000).optional(),
    }),
  }),
]);
type ConfigInput = z.infer<typeof ConfigInput>;

export const CreateSourceInput = z.object({
  name: text(120),
  description: z.string().trim().max(500).default(""),
  category: z.enum(["portal", "ats", "aggregator", "specialist", "government"]).optional(),
  accessStrategy: z.enum(["official_api", "partner_api", "licensed"]).optional(),
  geography: z.array(text(40)).max(20).default(["global"]),
  roleFamilies: z.array(text(60)).max(20).default([]),
  config: ConfigInput,
  /** Write-only. Stored encrypted; never echoed. */
  credential: z.string().min(4).max(4096).optional(),
  limits: z.object({ timeoutMs: z.number().int().min(2000).max(30_000), maxResults: z.number().int().min(1).max(500), refreshMinutes: z.number().int().min(15).max(10_080) }).partial().optional(),
});

export const UpdateSourceInput = z.object({
  name: text(120).optional(),
  description: z.string().trim().max(500).optional(),
  geography: z.array(text(40)).max(20).optional(),
  roleFamilies: z.array(text(60)).max(20).optional(),
  config: ConfigInput.optional(),
  status: z.enum(["paused", "disabled"]).optional(),
  statusReason: z.string().trim().max(300).optional(),
  limits: CreateSourceInput.shape.limits,
});

/* ------------------------------------------------------------ validation */

function urlsOf(c: ConfigInput): string[] {
  switch (c.kind) {
    case "json_api":
      return [c.api.endpoint];
    case "mcp":
      return [c.mcp.endpoint];
    case "feed":
      return [c.feed.url];
    case "structured":
      return [c.page.url];
    case "scraper":
      return [c.governance.canonicalSourceUrl];
    default:
      return [];
  }
}

/** The SSRF policy applied at input time (safeFetch applies it again, with DNS, at every request). */
function checkUrls(c: ConfigInput): Result<null> {
  for (const u of urlsOf(c)) {
    const d = checkDestination(u);
    if (!d.ok) return err(400, "DESTINATION_BLOCKED", `${u.slice(0, 120)} can't be used: ${d.reason}`);
  }
  return ok(null);
}

function describeKind(c: ConfigInput): Pick<SourceRecord, "category" | "accessStrategy" | "provider" | "capabilities"> {
  switch (c.kind) {
    case "ats_board":
      return { category: "ats", accessStrategy: "official_api", provider: ATS_META[c.platform].name, capabilities: ["Search", "Job details", "Freshness", "Employer identity", "Apply URL"] };
    case "json_api":
      return { category: "aggregator", accessStrategy: "official_api", provider: new URL(c.api.endpoint).hostname, capabilities: ["Search", "Apply URL"] };
    case "mcp":
      return { category: "aggregator", accessStrategy: "mcp", provider: new URL(c.mcp.endpoint).hostname, capabilities: ["Search", "Apply URL"] };
    case "feed":
      return { category: "ats", accessStrategy: "official_feed", provider: new URL(c.feed.url).hostname, capabilities: ["Freshness", "Apply URL"] };
    case "structured":
      return { category: "ats", accessStrategy: "structured", provider: new URL(c.page.url).hostname, capabilities: ["Job details", "Apply URL"] };
    case "scraper":
      return { category: "portal", accessStrategy: "scraper", provider: new URL(c.governance.canonicalSourceUrl).hostname, capabilities: [] };
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "source";

/* -------------------------------------------------------------- detection */

export function detect(url: string): Result<Detection & { destination?: string }> {
  if (!url?.trim()) return err(400, "INVALID_REQUEST", "Enter a URL.");
  const d = detectSource(url);
  if (d.kind === "custom") {
    const check = checkDestination(url.trim().match(/^https?:\/\//i) ? url.trim() : `https://${url.trim()}`);
    if (!check.ok) return err(400, "DESTINATION_BLOCKED", check.reason);
  }
  return ok(d);
}

/* ------------------------------------------------------------------ CRUD */

export async function createSource(raw: unknown, actor: string): Promise<Result<SourceRecord>> {
  const p = CreateSourceInput.safeParse(raw);
  if (!p.success) return err(400, "INVALID_REQUEST", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 3).join("; "));
  const input = p.data;
  const urls = checkUrls(input.config);
  if (!urls.ok) return urls;
  const store = jobsLakeStore();
  const kind = describeKind(input.config);
  const id = input.config.kind === "ats_board" ? `ats_${input.config.platform}_${slug(input.config.slug)}` : `${input.config.kind}_${slug(input.name)}_${randomBytes(3).toString("hex")}`;
  if (await getSource(id)) return err(409, "INVALID_REQUEST", "That source is already registered.", { sourceId: id });
  const now = new Date().toISOString();
  const gov = input.config.kind === "scraper" ? input.config.governance : null;
  const scraper = !!gov;
  const permitted = !!gov && (gov.permission === "granted_in_writing" || gov.permission === "terms_permit") && gov.termsReviewed && gov.robotsReviewed;
  const rec: SourceRecord = {
    id,
    name: input.name,
    provider: kind.provider,
    category: input.category ?? kind.category,
    accessStrategy: input.config.kind === "json_api" && input.accessStrategy ? input.accessStrategy : kind.accessStrategy,
    protocolVersion: PROTOCOL_VERSION,
    // Scrapers are registered for the record only: no scraper engine runs on this deployment.
    status: scraper ? "do_not_use" : "draft",
    statusReason: scraper ? (permitted ? "Permission recorded, but no scraper engine is enabled on this deployment." : "Scraping permission hasn't been established (spec §46).") : undefined,
    description: input.description,
    geography: input.geography,
    roleFamilies: input.roleFamilies,
    capabilities: kind.capabilities,
    config: input.config as SourceConfig,
    limits: { ...DEFAULT_LIMITS, ...input.limits },
    legacySourceId: input.config.kind === "ats_board" ? "careers" : undefined,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  };
  if (input.credential) {
    const headerName = input.config.kind === "json_api" ? input.config.api.credentialHeader : input.config.kind === "mcp" ? input.config.mcp.credentialHeader : undefined;
    if (!headerName) return err(400, "INVALID_REQUEST", "Set the header the credential goes in before adding one.");
    rec.secretRef = await saveCredential(input.credential);
  }
  await store.putSource(rec);
  await audit(actor, "source.created", id, { kind: input.config.kind, status: rec.status, credential: input.credential ? "set" : "none" });
  return ok(rec);
}

export async function updateSource(id: string, raw: unknown, actor: string): Promise<Result<SourceRecord>> {
  const src = await getSource(id);
  if (!src) return err(404, "NOT_FOUND", "No such source.");
  const p = UpdateSourceInput.safeParse(raw);
  if (!p.success) return err(400, "INVALID_REQUEST", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 3).join("; "));
  const u = p.data;
  if (src.config.kind === "partnership") return err(403, "FORBIDDEN", "Partnership sources can't be changed until a partnership exists.");
  if (src.builtin && (u.config || u.name || u.description || u.geography)) return err(403, "FORBIDDEN", "Built-in sources are defined in code; only their status and limits can change here.");
  if (u.config && u.config.kind !== src.config.kind) return err(400, "INVALID_REQUEST", "A source's type can't change — add a new source instead.");
  if (u.config) {
    const urls = checkUrls(u.config);
    if (!urls.ok) return urls;
  }
  const next: SourceRecord = { ...src, updatedAt: new Date().toISOString() };
  if (u.name) next.name = u.name;
  if (u.description !== undefined) next.description = u.description;
  if (u.geography) next.geography = u.geography;
  if (u.roleFamilies) next.roleFamilies = u.roleFamilies;
  if (u.limits) next.limits = { ...src.limits, ...u.limits };
  const changes: string[] = Object.keys(u).filter((k) => k !== "status" && k !== "statusReason");
  if (u.config) {
    next.config = u.config as SourceConfig;
    // A changed connection must be proven again before it serves candidates.
    if (src.status !== "do_not_use") next.status = "draft";
    next.lastTest = undefined;
  }
  if (u.status) {
    if (!ADMIN_SETTABLE.includes(u.status) || src.status === "do_not_use") return err(400, "INVALID_REQUEST", "That status can't be set directly.");
    next.status = u.status;
    next.statusReason = u.statusReason ?? (u.status === "paused" ? "Paused by an admin" : "Disabled by an admin");
  }
  await jobsLakeStore().putSource(next);
  if (u.status) await audit(actor, `source.${u.status}`, id, { from: src.status, reason: next.statusReason });
  if (changes.length) await audit(actor, "source.updated", id, { fields: changes, statusAfter: next.status });
  return ok(next);
}

export async function removeSource(id: string, actor: string): Promise<Result<{ deleted: true }>> {
  const src = await getSource(id);
  if (!src) return err(404, "NOT_FOUND", "No such source.");
  if (src.builtin) return err(403, "FORBIDDEN", "Built-in sources can be paused or disabled, not deleted.");
  await deleteCredential(src.secretRef);
  await jobsLakeStore().deleteSource(id);
  await audit(actor, "source.deleted", id, { name: src.name, status: src.status });
  return ok({ deleted: true });
}

/* ------------------------------------------------------ test / activate */

export async function testSourceById(id: string, actor: string): Promise<Result<TestReport>> {
  const src = await getSource(id);
  if (!src) return err(404, "NOT_FOUND", "No such source.");
  if (src.config.kind === "partnership") return err(409, "SOURCE_NEEDS_SETUP", "Partnership required — there's nothing JobsLake is allowed to test.", { sourceId: id });
  const report = await testSource(src, actor);
  // A draft that has been tested is "Testing" until an admin activates it; nothing else changes status here.
  await jobsLakeStore().putSource({ ...src, lastTest: report, status: src.status === "draft" ? "testing" : src.status, updatedAt: new Date().toISOString() });
  return ok(report);
}

export async function activateSource(id: string, actor: string): Promise<Result<SourceRecord>> {
  const src = await getSource(id);
  if (!src) return err(404, "NOT_FOUND", "No such source.");
  if (src.config.kind === "partnership" || src.config.kind === "scraper" || src.status === "do_not_use") return err(403, "FORBIDDEN", "This source can't be activated: it has no authorized access path.", { sourceId: id });
  const t = src.lastTest;
  if (!t) return err(409, "VALIDATION_FAILED", "Run a test first — a source is only activated after a passing test.", { sourceId: id });
  if (!t.ok) return err(409, "VALIDATION_FAILED", `The last test failed${t.error ? `: ${t.error}` : ""}. Fix it and test again.`, { sourceId: id });
  if (Date.now() - Date.parse(t.at) > ACTIVATION_WINDOW_MS) return err(409, "VALIDATION_FAILED", "The last passing test is more than 24 hours old. Test again before activating.", { sourceId: id });
  const now = new Date().toISOString();
  const next: SourceRecord = { ...src, status: "active", statusReason: undefined, activatedAt: now, updatedAt: now };
  await jobsLakeStore().putSource(next);
  await audit(actor, "source.activated", id, { from: src.status, testedAt: t.at, discovered: t.discovered, valid: t.valid });
  return ok(next);
}

/* ------------------------------------------------------------ credentials */

export async function setSourceCredential(id: string, secret: unknown, actor: string) {
  const src = await getSource(id);
  if (!src) return err(404, "NOT_FOUND", "No such source.");
  if (typeof secret !== "string" || secret.trim().length < 4 || secret.length > 4096) return err(400, "INVALID_REQUEST", "Enter the credential (4–4,096 characters).");
  if (src.secretRef?.startsWith("env:")) return err(409, "INVALID_REQUEST", "This credential is managed in the deployment's environment variables, not in JobsLake.");
  if (src.config.kind !== "json_api" && src.config.kind !== "mcp") return err(400, "INVALID_REQUEST", "This kind of source doesn't take a credential.");
  const replacing = !!src.secretRef;
  const ref = await saveCredential(secret, src.secretRef);
  await jobsLakeStore().putSource({ ...src, secretRef: ref, updatedAt: new Date().toISOString() });
  await audit(actor, replacing ? "credential.replaced" : "credential.created", id);
  return ok({ credential: await credentialStatus(ref) });
}

export async function removeSourceCredential(id: string, actor: string) {
  const src = await getSource(id);
  if (!src) return err(404, "NOT_FOUND", "No such source.");
  if (!src.secretRef || src.secretRef.startsWith("env:")) return err(409, "INVALID_REQUEST", "There's no JobsLake-managed credential to remove.");
  await deleteCredential(src.secretRef);
  await jobsLakeStore().putSource({ ...src, secretRef: undefined, updatedAt: new Date().toISOString() });
  await audit(actor, "credential.deleted", id);
  return ok({ credential: null });
}

/* -------------------------------------------------- mapping preview */

export interface PreviewResult {
  sample: unknown;
  mapping?: MappingResult;
  jobs: number;
  firstJobs: { title: string; company: string; location: string; applyUrl: string; postedAt: string }[];
}

/**
 * The mapping editor's live preview: fetch the draft source with a proposed mapping and show what it
 * would produce. Nothing is stored, and it only works on a saved source (so any credential is
 * already encrypted server-side rather than sent with the preview).
 */
export async function previewSource(id: string, mappingRaw: unknown, actor: string): Promise<Result<PreviewResult>> {
  const src = await getSource(id);
  if (!src) return err(404, "NOT_FOUND", "No such source.");
  if (src.config.kind !== "json_api" && src.config.kind !== "mcp" && src.config.kind !== "feed" && src.config.kind !== "structured" && src.config.kind !== "ats_board") return err(400, "INVALID_REQUEST", "This source has nothing to preview.");
  let trial = src;
  if (mappingRaw != null) {
    const m = Mapping.safeParse(mappingRaw);
    if (!m.success) return err(400, "INVALID_REQUEST", "Invalid mapping.");
    if (src.config.kind === "json_api") trial = { ...src, config: { kind: "json_api", api: { ...src.config.api, mapping: m.data } } };
    else if (src.config.kind === "mcp") trial = { ...src, config: { kind: "mcp", mcp: { ...src.config.mcp, mapping: m.data } } };
  }
  try {
    const r = await runConnector(trial, { query: "", locations: [] }, "shallow");
    await audit(actor, "source.previewed", id, { jobs: r.jobs.length });
    return ok({ sample: r.sample ?? null, mapping: r.mapping, jobs: r.jobs.length, firstJobs: r.jobs.slice(0, 5).map((j) => ({ title: j.title, company: j.company, location: j.location, applyUrl: j.applyUrl, postedAt: j.postedAt })) });
  } catch (e) {
    return err(502, "SOURCE_UNAVAILABLE", e instanceof Error ? e.message.slice(0, 200) : "The source didn't answer.", { sourceId: id });
  }
}

/* ---------------------------------------------------------- playground */

/** An admin's search, with raw per-source messages and the plan. Recorded as "playground" runs. */
export async function playground(req: SearchRequest, actor: string) {
  const { response, plan } = await search(req, { trigger: "playground" });
  await audit(actor, "playground.search", undefined, { query: req.query.text, locations: req.query.locations, mode: req.searchMode, requestId: response.requestId, unique: response.metadata.unique });
  return { response, plan };
}

export const ADMIN_STATUSES: SourceStatus[] = ["draft", "testing", "active", "paused", "degraded", "disabled", "do_not_use"];
export type { AtsPlatform };
