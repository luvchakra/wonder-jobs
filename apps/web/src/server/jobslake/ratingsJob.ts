/**
 * The company-ratings job (admin → Company ratings → Run). It takes the companies never looked up (or not for 90
 * days) fifty at a time, asks Explorium for their ratings with the first API key on the list, and stores what it
 * finds on the company. A key that is out of credits, or that Explorium refuses, is deleted from the list and the
 * next key takes over; when the last key is gone it says how many companies are still waiting. Each call runs
 * for a limited time and says whether to call again.
 */
import { companyStore, type CompanyStore } from "./companies";
import { EXPLORIUM_BATCH, exploriumCredits, exploriumRatings } from "./explorium";
import { ratingKeyStore, type RatingKeyStore } from "./ratingKeys";

/** Ratings are looked for again after this long. */
export const RATINGS_TTL_MS = 90 * 86_400_000;

export interface RetiredKey {
  masked: string;
  label: string;
  reason: "out of credits" | "refused by Explorium";
}

export interface RatingsRunReport {
  /** complete: nothing is waiting · needs_key: keys ran out with companies left · more: time's up, call again · stopped: Explorium or the network is in the way. */
  status: "complete" | "needs_key" | "more" | "stopped";
  /** Companies looked up in this call, how many had a rating, how many Explorium had none for. */
  checked: number;
  rated: number;
  notFound: number;
  retired: RetiredKey[];
  keysLeft: number;
  /** Companies still waiting for a lookup. */
  left: number;
  message: string;
}

let running = false;

export async function runRatings(
  opts: { budgetMs?: number; now?: number; companies?: CompanyStore; keys?: RatingKeyStore; fetcher?: typeof fetch; onRetire?: (k: RetiredKey) => Promise<void> } = {},
): Promise<RatingsRunReport> {
  const companies = opts.companies ?? companyStore();
  const keyStore = opts.keys ?? ratingKeyStore();
  const startedAt = Date.now();
  const budget = opts.budgetMs ?? 40_000;
  const staleBefore = new Date((opts.now ?? Date.now()) - RATINGS_TTL_MS).toISOString();
  const report: RatingsRunReport = { status: "complete", checked: 0, rated: 0, notFound: 0, retired: [], keysLeft: 0, left: 0, message: "" };
  const finish = async (status: RatingsRunReport["status"], message: string) => {
    report.status = status;
    report.message = message;
    report.keysLeft = (await keyStore.list()).length;
    report.left = (await companies.ratingsCoverage(staleBefore)).waiting;
    return report;
  };
  if (running) return finish("stopped", "A ratings job is already running. Wait for it to finish.");
  running = true;
  try {
    for (;;) {
      const due = await companies.needingRatings(EXPLORIUM_BATCH, staleBefore);
      if (!due.length) return await finish("complete", "All companies are covered — no company left.");
      const keys = await keyStore.list();
      if (!keys.length) {
        const left = (await companies.ratingsCoverage(staleBefore)).waiting;
        return await finish("needs_key", `${left} ${left === 1 ? "company is" : "companies are"} still left. Add a new API key to continue.`);
      }
      if (Date.now() - startedAt > budget) return await finish("more", "Working…");

      const key = keys[0];
      const retire = async (reason: RetiredKey["reason"]) => {
        await keyStore.remove(key.id);
        const k = { masked: key.masked, label: key.label, reason };
        report.retired.push(k);
        await opts.onRetire?.(k);
      };
      const secret = await keyStore.secret(key.id);
      if (!secret) {
        await keyStore.remove(key.id);
        continue;
      }
      const credits = await exploriumCredits(secret, opts.fetcher);
      if (credits.kind === "rejected") {
        await retire("refused by Explorium");
        continue;
      }
      if (credits.kind === "error") return await finish("stopped", `${credits.message}. Nothing was lost — run the job again.`);
      await keyStore.touch(key.id, { creditsLeft: credits.remaining, creditsCheckedAt: new Date().toISOString() });
      if (credits.remaining <= 0) {
        await retire("out of credits");
        continue;
      }

      // A company costs at least a credit, so never ask for more than the key has.
      const batch = due.slice(0, Math.min(EXPLORIUM_BATCH, credits.remaining));
      const res = await exploriumRatings(secret, batch, opts.fetcher);
      if (res.kind === "exhausted" || res.kind === "rejected") {
        await retire(res.kind === "exhausted" ? "out of credits" : "refused by Explorium");
        continue;
      }
      if (res.kind === "limited") return await finish("stopped", "Explorium is limiting requests. Wait a minute and run the job again.");
      if (res.kind === "error") return await finish("stopped", `${res.message}. Nothing was lost — run the job again.`);
      const at = new Date().toISOString();
      await companies.setRatings(res.ratings, batch.map((b) => b.domain), at);
      await keyStore.touch(key.id, { lastUsedAt: at });
      report.checked += batch.length;
      report.rated += res.ratings.size;
      report.notFound += batch.length - res.ratings.size;
    }
  } finally {
    running = false;
  }
}
