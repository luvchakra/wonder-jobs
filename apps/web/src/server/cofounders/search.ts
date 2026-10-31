/**
 * Co-founders Find: one search of WorksLake's Co-founders dataset (module = 'cofounders'), turned into the people and
 * teams who match, and the per-source provenance the searcher sees ("searched X across Y").
 *
 * The WorksLake answer only says which listings matched. Each is then read again from its owner's current public listing
 * (never from a cached copy) and kept only while its owner is still open to being found, and only if the searcher and
 * the listing's people haven't blocked each other. The searcher's own profile and teams are never listed to them.
 */
import { search } from "@/server/jobslake/core";
import type { Session } from "../auth";
import { COFOUNDERS, type CofounderListing } from "@/modules/cofounders/domain";
import { openProfiles } from "./profiles";
import { openTeams } from "./teams";
import { WONDERWORKS_COFOUNDERS } from "./profiles";
import { founderIds, hiddenFor, members } from "./store";

export type SourceState = "ok" | "empty" | "needs_setup" | "unavailable" | "skipped";

export interface CofoundersSourceLine {
  id: string;
  name: string;
  state: SourceState;
  count: number;
  message?: string;
}

export interface CofoundersSearchResult {
  searched: { query: string; places: string[] };
  results: CofounderListing[];
  sources: CofoundersSourceLine[];
}

const MAX_RESULTS = 200;

export async function searchCofounders(s: Session, input: { query: string; places: string[]; refresh?: boolean }): Promise<CofoundersSearchResult> {
  const query = input.query.trim().slice(0, 120);
  const places = input.places.map((p) => p.trim()).filter(Boolean).slice(0, 5);
  const [{ response, plan }, people, teams, hidden, mine] = await Promise.all([
    search({ query: { text: query, locations: places }, searchMode: "balanced", limit: MAX_RESULTS, module: COFOUNDERS, cache: input.refresh ? "refresh" : "use" }, { trigger: "search" }),
    openProfiles(),
    openTeams(),
    hiddenFor(s.tenantId),
    members().find({ tenant_id: s.tenantId }),
  ]);
  const matched = new Set(response.results.flatMap((o) => o.sourceRecords.filter((r) => r.sourceId === WONDERWORKS_COFOUNDERS).map((r) => r.sourceJobId)));
  const results: CofounderListing[] = [];
  for (const p of people) if (matched.has(p.listing.id) && p.tenant !== s.tenantId && !hidden.people.has(p.tenant)) results.push(p.listing);
  const myTeamIds = new Set(mine.map((m) => m.team_id));
  for (const t of teams) {
    if (!matched.has(t.listing.id) || myTeamIds.has(t.id) || hidden.teams.has(t.id)) continue;
    // A team is hidden from someone who blocked, or was blocked by, any of its founders.
    if ((await founderIds(t.id)).some((f) => hidden.people.has(f))) continue;
    results.push(t.listing);
  }
  const lines: CofoundersSourceLine[] = response.sources.map((src) => ({
    id: src.sourceId,
    name: src.sourceName,
    state: src.outcome === "ok" ? "ok" : src.outcome === "empty" ? "empty" : src.outcome === "needs_setup" ? "needs_setup" : src.outcome === "skipped" ? "skipped" : "unavailable",
    count: results.filter((r) => r.sourceId === src.sourceId).length,
    ...(src.message ? { message: src.message } : {}),
  }));
  for (const sk of plan.skipped) if (!lines.some((l) => l.id === sk.id)) lines.push({ id: sk.id, name: sk.name, state: /credential/i.test(sk.reason) ? "needs_setup" : "skipped", count: 0, message: /credential/i.test(sk.reason) ? "Needs setup" : sk.reason });
  return { searched: { query, places }, results, sources: lines };
}
