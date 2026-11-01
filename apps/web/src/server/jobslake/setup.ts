import { dataTypeOf } from "@/domain/jobslake/moduleData";
import { MODULES } from "@/modules/registry";
import { gatewayOverview } from "@/server/gateway/admin";
import { PLATFORM_KEYS } from "./platformKeys";
import { decisionsDone, OWNER_DECISIONS } from "./decisions";
import { listAllSourceViews, type SourceView } from "./views";

export type SetupNeed = "decision" | "key" | "terms" | "add" | "activate" | "connection" | "other";

/** One thing the admin has to do before a source can bring listings in, and where to do it. */
export interface SetupItem {
  id: string;
  name: string;
  module: string;
  moduleLabel: string;
  dataType: string;
  need: SetupNeed;
  /** What exactly is missing, in a line. */
  detail: string;
  action: { label: string; href: string };
  /** A gateway step the Setup page can do in one press (owner, 2026-11-01): add from the catalogue, or test and activate. */
  run?: { kind: "add"; file: string } | { kind: "activate"; sourceId: string };
  /** The countries the source serves (two-letter codes, "global", "remote"); empty when it doesn't say. */
  countries: string[];
  /** An owner decision (decisions.ts): marked done on the page instead of fixed elsewhere. */
  decision?: true;
}

const LAKE = "/platform/jobs-lake";
const PLATFORM_NAMES = new Set(PLATFORM_KEYS.map((k) => k.name));
const label = (id: string) => (id === "all" ? "Every module" : (MODULES.find((m) => m.id === id)?.label ?? id));
const vars = (masked: string) => masked.match(/[A-Z][A-Z0-9_]{3,}/g) ?? [];

/** What a WorksLake source still needs, or null when it is ready (or deliberately off). */
export function sourceNeed(s: SourceView): Pick<SetupItem, "need" | "detail" | "action"> | null {
  const page = { label: "Open source", href: `${LAKE}/sources/${encodeURIComponent(s.id)}` };
  if (s.status === "do_not_use" || s.status === "disabled") return null;
  if (s.partner?.readiness.next === "connection" || s.partner?.readiness.next === "credential") return { need: "connection", detail: s.partner.readiness.next === "connection" ? "Partner portal: needs its endpoint" : "Partner portal: needs its credential", action: page };
  if (s.credential && !s.credential.present) {
    const names = vars(s.credential.masked);
    const onPlatform = names.length > 0 && names.every((n) => PLATFORM_NAMES.has(n));
    return { need: "key", detail: names.length ? `Needs ${names.join(" + ")}` : "Needs its credential", action: onPlatform ? { label: "Set key", href: `${LAKE}/keys` } : { label: "Add credential", href: `${LAKE}/credentials` } };
  }
  // Terms pending: a source the owner still has to confirm, whether it's paused for it or live meanwhile (CLAUDE.md, "Finding data sources").
  if (/terms pending/i.test(s.statusReason ?? "") || (s.status === "paused" && /terms/i.test(s.statusReason ?? ""))) return { need: "terms", detail: `${s.status === "paused" ? "Paused" : "Live"} · ${s.statusReason}`, action: page };
  if ((s.status === "active" || s.status === "degraded") && !s.available) return { need: "other", detail: s.statusReason || "Active, but can't be asked on this deployment", action: page };
  if (s.status === "draft" || s.status === "testing") return { need: "activate", detail: s.status === "draft" ? "Draft: test it, then activate" : "Tested: activate it", action: page };
  return null;
}

/** Everything across every module that needs a key or other setup, sources and gateway together. */
export async function setupTodo(): Promise<{ items: SetupItem[]; gatewayConfigured: boolean }> {
  const [sources, gw, done] = await Promise.all([listAllSourceViews(), gatewayOverview().catch(() => null), decisionsDone().catch(() => ({}) as Record<string, unknown>)]);
  const items: SetupItem[] = [];
  for (const d of OWNER_DECISIONS) {
    if (d.id in done) continue;
    items.push({ id: `decision:${d.id}`, name: d.title, module: d.module, moduleLabel: label(d.module), dataType: d.module === "all" ? "Data sources" : dataTypeOf(d.module).type, need: "decision", countries: d.geography ?? [], detail: d.detail, action: { label: d.href ? "Open" : "Details", href: d.href ?? "/platform/jobs-lake/setup" }, decision: true });
  }
  for (const s of sources) {
    const n = sourceNeed(s);
    if (!n) continue;
    const mod = s.module ?? "jobs";
    items.push({ id: s.id, name: s.name, module: mod, moduleLabel: label(mod), dataType: dataTypeOf(mod).type, countries: s.geography ?? [], ...n });
  }
  for (const c of gw?.catalogue ?? []) {
    if (c.added) continue;
    const mod = c.modules[0] ?? "jobs";
    items.push({ id: `catalogue:${c.file}`, name: c.name, module: mod, moduleLabel: label(mod), dataType: dataTypeOf(mod).type, countries: c.geography, need: "add", detail: `Gateway catalogue (${c.kind}, ${c.host}): not added yet${c.termsPending ? " · terms pending" : ""}`, action: { label: "Add & activate", href: `${LAKE}/gateway` }, run: { kind: "add", file: c.file } });
  }
  for (const g of gw?.sources ?? []) {
    if (g.enabled) {
      if (g.termsPending) {
        const mod = g.modules[0] ?? "jobs";
        items.push({ id: `gateway-terms:${g.id}`, name: g.name, module: mod, moduleLabel: label(mod), dataType: dataTypeOf(mod).type, countries: g.geography, need: "terms", detail: "Gateway, live · terms pending: confirm its reuse terms", action: { label: "Open gateway", href: `${LAKE}/gateway` } });
      }
      continue;
    }
    const mod = g.modules[0] ?? "jobs";
    items.push({ id: `gateway:${g.id}`, name: g.name, module: mod, moduleLabel: label(mod), dataType: dataTypeOf(mod).type, countries: g.geography, need: "activate", detail: g.lastTest ? (g.lastTest.ok ? `Gateway: tested (${g.lastTest.valid} valid), not active` : "Gateway: last test failed") : "Gateway: added, paused — Test, then Activate", action: { label: "Test & activate", href: `${LAKE}/gateway` }, run: { kind: "activate", sourceId: g.id } });
  }
  const order: SetupNeed[] = ["decision", "key", "terms", "add", "activate", "connection", "other"];
  items.sort((a, b) => order.indexOf(a.need) - order.indexOf(b.need) || a.moduleLabel.localeCompare(b.moduleLabel) || a.name.localeCompare(b.name));
  return { items, gatewayConfigured: !!gw?.configured };
}
