import { dataTypeOf } from "@/domain/jobslake/moduleData";
import { MODULES } from "@/modules/registry";
import { gatewayOverview } from "@/server/gateway/admin";
import { PLATFORM_KEYS } from "./platformKeys";
import { listAllSourceViews, type SourceView } from "./views";

export type SetupNeed = "key" | "terms" | "add" | "activate" | "connection" | "other";

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
}

const LAKE = "/platform/jobs-lake";
const PLATFORM_NAMES = new Set(PLATFORM_KEYS.map((k) => k.name));
const label = (id: string) => MODULES.find((m) => m.id === id)?.label ?? id;
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
  if (s.status === "paused" && /terms/i.test(s.statusReason ?? "")) return { need: "terms", detail: s.statusReason!, action: page };
  // A live source whose terms the owner still has to confirm (CLAUDE.md, "Finding data sources"): listed until confirmed.
  if ((s.status === "active" || s.status === "degraded") && /^terms pending/i.test(s.statusReason ?? "")) return { need: "terms", detail: s.statusReason!, action: page };
  if ((s.status === "active" || s.status === "degraded") && !s.available) return { need: "other", detail: s.statusReason || "Active, but can't be asked on this deployment", action: page };
  if (s.status === "draft" || s.status === "testing") return { need: "activate", detail: s.status === "draft" ? "Draft: test it, then activate" : "Tested: activate it", action: page };
  return null;
}

/** Everything across every module that needs a key or other setup, sources and gateway together. */
export async function setupTodo(): Promise<{ items: SetupItem[]; gatewayConfigured: boolean }> {
  const [sources, gw] = await Promise.all([listAllSourceViews(), gatewayOverview().catch(() => null)]);
  const items: SetupItem[] = [];
  for (const s of sources) {
    const n = sourceNeed(s);
    if (!n) continue;
    const mod = s.module ?? "jobs";
    items.push({ id: s.id, name: s.name, module: mod, moduleLabel: label(mod), dataType: dataTypeOf(mod).type, ...n });
  }
  for (const c of gw?.catalogue ?? []) {
    if (c.added) continue;
    const mod = c.modules[0] ?? "jobs";
    items.push({ id: `catalogue:${c.file}`, name: c.name, module: mod, moduleLabel: label(mod), dataType: dataTypeOf(mod).type, need: "add", detail: `Gateway catalogue (${c.kind}, ${c.host}): not added yet`, action: { label: "Add from catalogue", href: `${LAKE}/gateway` } });
  }
  for (const g of gw?.sources ?? []) {
    if (g.enabled) continue;
    const mod = g.modules[0] ?? "jobs";
    items.push({ id: `gateway:${g.id}`, name: g.name, module: mod, moduleLabel: label(mod), dataType: dataTypeOf(mod).type, need: "activate", detail: g.lastTest ? (g.lastTest.ok ? `Gateway: tested (${g.lastTest.valid} valid), not active` : "Gateway: last test failed") : "Gateway: added, paused — Test, then Activate", action: { label: "Test & activate", href: `${LAKE}/gateway` } });
  }
  const order: SetupNeed[] = ["key", "terms", "add", "activate", "connection", "other"];
  items.sort((a, b) => order.indexOf(a.need) - order.indexOf(b.need) || a.moduleLabel.localeCompare(b.moduleLabel) || a.name.localeCompare(b.name));
  return { items, gatewayConfigured: !!gw?.configured };
}
