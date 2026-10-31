import { hostedGateway } from "./index";

/** One source as the admin page shows it: what it is, how it is doing, how far a crawl has got. Never a secret. */
export interface GatewaySourceRow {
  id: string;
  name: string;
  kind: string;
  modules: string[];
  host: string;
  enabled: boolean;
  listings: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  nextRunAt: string | null;
  intervalMinutes: number;
  lastTest: { at: string; ok: boolean; discovered: number; valid: number } | null;
  crawl: { pagesPerRun: number; progress: string | null; lastRead: number | null; lastFailed: number | null } | null;
}
export interface GatewayRunRow { at: string; sourceId: string; source: string; trigger: string; ok: boolean; discovered?: number; valid?: number; kept?: number; ms?: number; read?: number; failed?: number; code?: string }
export interface GatewayOverview {
  configured: boolean;
  sources: GatewaySourceRow[];
  runs: GatewayRunRow[];
  byModule: { module: string; listings: number }[];
  last24h: { runs: number; ok: number; failed: number; collected: number };
  usageToday: { route: string; module: string; calls: number; results: number }[];
}

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const numOr = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** The hosted gateway's state for platform admins (the route checks the admin first). */
export async function gatewayOverview(now = Date.now()): Promise<GatewayOverview> {
  const hosted = hostedGateway();
  if (!hosted) return { configured: false, sources: [], runs: [], byModule: [], last24h: { runs: 0, ok: 0, failed: 0, collected: 0 }, usageToday: [] };
  return hosted.store.read((s) => {
    const counts = new Map<string, number>();
    const perModule = new Map<string, number>();
    for (const l of s.listings as Rec[]) {
      if (Date.parse(String(l.expiresAt)) <= now) continue;
      counts.set(String(l.sourceId), (counts.get(String(l.sourceId)) ?? 0) + 1);
      perModule.set(String(l.module), (perModule.get(String(l.module)) ?? 0) + 1);
    }
    const names = new Map((s.sources as Rec[]).map((x) => [String(x.id), String(x.attribution ?? x.id)]));
    const sources: GatewaySourceRow[] = (s.sources as Rec[]).map((x) => {
      const crawlish = x.kind === "crawl" || typeof x.nextPath === "string";
      const lastCrawl = (x.lastCrawl ?? null) as Rec | null;
      const cursor = x.crawlCursor;
      return {
        id: String(x.id),
        name: String(x.attribution ?? x.id),
        kind: String(x.kind),
        modules: (x.modules as string[]) ?? [],
        host: (() => { try { return new URL(String(x.url)).hostname; } catch { return ""; } })(),
        enabled: x.enabled === true,
        listings: counts.get(String(x.id)) ?? 0,
        lastSuccessAt: str(x.lastSuccessAt),
        lastError: str(x.lastError),
        nextRunAt: str(x.nextRunAt),
        intervalMinutes: numOr(x.minIntervalMinutes, 0),
        lastTest: (x.lastTest as GatewaySourceRow["lastTest"]) ?? null,
        crawl: crawlish
          ? {
              pagesPerRun: numOr(x.maxPagesPerRun, 0),
              progress: typeof cursor === "number" ? (lastCrawl?.pages ? `page ${cursor} of ${String(lastCrawl.pages)}` : `page ${cursor}`) : typeof cursor === "string" && cursor ? "part-way (carries on next run)" : lastCrawl ? "from the start next run" : null,
              lastRead: lastCrawl ? numOr(lastCrawl.read, 0) : null,
              lastFailed: lastCrawl ? numOr(lastCrawl.failed, 0) : null,
            }
          : null,
      };
    });
    const runs = ((s.runs ?? []) as Rec[]).slice(-100).reverse().map((r) => ({ ...(r as unknown as GatewayRunRow), source: names.get(String(r.sourceId)) ?? String(r.sourceId) }));
    const recent = ((s.runs ?? []) as Rec[]).filter((r) => Date.parse(String(r.at)) > now - 86_400_000 && r.trigger === "collect");
    const day = new Date(now).toISOString().slice(0, 10);
    return {
      configured: true,
      sources,
      runs,
      byModule: [...perModule].map(([module, listings]) => ({ module, listings })).sort((a, b) => b.listings - a.listings),
      last24h: { runs: recent.length, ok: recent.filter((r) => r.ok).length, failed: recent.filter((r) => !r.ok).length, collected: recent.reduce((n, r) => n + numOr(r.valid, 0), 0) },
      usageToday: (s.usage as Rec[]).filter((u) => u.day === day).map((u) => ({ route: String(u.route), module: String(u.module), calls: numOr(u.count, 0), results: numOr(u.results, 0) })),
    };
  });
}

/** Collects one source now (platform admin only, checked by the route). */
export async function collectGatewaySource(sourceId: string) {
  const hosted = hostedGateway();
  if (!hosted) return { ok: false as const, code: "NOT_CONFIGURED" };
  try {
    const r = await hosted.gateway.collectOne(sourceId);
    return { ok: true as const, valid: r.valid, discovered: r.discovered };
  } catch (e) {
    return { ok: false as const, code: (e as { code?: string }).code ?? "SOURCE_UNAVAILABLE" };
  }
}
