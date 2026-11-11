import { pushAudit, reconcileSource } from "../../../../data-gateway/src/core.mjs";
import { CATALOGUE } from "./catalogue";
import { hostedGateway } from "./index";

/**
 * Registered sources take what their reviewed catalogue file now says about outside use (WJ-815): whether outside
 * consumers may see the source, its prospect dataset bindings, the dataset's extra fields and the permission evidence.
 * Nothing else about a registered source changes (it keeps the definition it was added with), each change is audited,
 * and a second pass changes nothing. Runs before a collection or a delivery, and when the Prospect data card opens.
 */
export async function syncCatalogueDefinitions(): Promise<{ sourceId: string; fields: string[] }[]> {
  const hosted = hostedGateway();
  if (!hosted) return [];
  const byUrl = new Map(Object.values(CATALOGUE).map((def) => [String(def.url), def]));
  const diff = (sources: Record<string, unknown>[], apply: boolean) => {
    const out: { sourceId: string; fields: string[] }[] = [];
    for (const src of sources) {
      const def = byUrl.get(String(src.url));
      if (!def || def.kind !== src.kind) continue;
      try {
        const fields = reconcileSource(apply ? src : structuredClone(src), def);
        if (fields.length) out.push({ sourceId: String(src.id), fields });
      } catch {
        // A stored source its file no longer fits is left exactly as it is.
      }
    }
    return out;
  };
  if (!(await hosted.store.read((s) => diff(s.sources, false))).length) return [];
  return hosted.store.change((s) => {
    const changed = diff(s.sources, true);
    for (const c of changed) pushAudit(s, { at: new Date().toISOString(), action: "source.reconciled", target: c.sourceId, fields: c.fields });
    return changed;
  });
}
