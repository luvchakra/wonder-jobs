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
  reason: "out of credits" | "too few credits left for another company" | "refused by Explorium";
  /** The credits Explorium said it had left when the key was removed. */
  creditsLeft?: number;
}

/**
 * What a company Explorium matches costs, in credits, until the job has measured it: the top of Explorium's own
 * "1 to 5". It is measured from the balance before and after each batch (a matched company cost 2 on the first run).
 */
const ASSUMED_COST = 5;

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
    let cost = ASSUMED_COST;
    let spent: { key: string; before: number; matched: number } | undefined;
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
      const retire = async (reason: RetiredKey["reason"], creditsLeft?: number) => {
        await keyStore.remove(key.id);
        const k: RetiredKey = { masked: key.masked, label: key.label, reason, ...(creditsLeft !== undefined ? { creditsLeft } : {}) };
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
        await retire("out of credits", 0);
        continue;
      }
      // What the last batch actually cost, per company it matched, from the balance before and after.
      if (spent && spent.matched > 0 && spent.key === key.id && spent.before > credits.remaining) cost = Math.max(1, Math.ceil((spent.before - credits.remaining) / spent.matched));
      spent = undefined;

      // Ask for as many companies as the credits can pay for at the measured cost — and if Explorium still says
      // no while the key has credits, for half as many, down to one. A key is only deleted when it can't pay for one.
      let size = Math.max(1, Math.min(due.length, Math.floor(credits.remaining / cost)));
      let res = await exploriumRatings(secret, due.slice(0, size), opts.fetcher);
      while ((res.kind === "exhausted" || res.kind === "rejected") && size > 1) {
        size = Math.max(1, Math.floor(size / 2));
        res = await exploriumRatings(secret, due.slice(0, size), opts.fetcher);
      }
      if (res.kind === "exhausted" || res.kind === "rejected") {
        // One company was refused. Ask Explorium why before deleting anything: a key it still accepts has credits
        // to count, one it refuses is dead.
        const again = await exploriumCredits(secret, opts.fetcher);
        if (again.kind === "rejected") await retire("refused by Explorium");
        else if (again.kind === "ok") await retire(again.remaining > 0 ? "too few credits left for another company" : "out of credits", again.remaining);
        else return await finish("stopped", `${again.message}. Nothing was lost — run the job again.`);
        continue;
      }
      if (res.kind === "limited") return await finish("stopped", "Explorium is limiting requests. Wait a minute and run the job again.");
      if (res.kind === "error") return await finish("stopped", `${res.message}. Nothing was lost — run the job again.`);
      const batch = due.slice(0, size);
      const at = new Date().toISOString();
      await companies.setRatings(res.ratings, batch.map((b) => b.domain), at);
      await keyStore.touch(key.id, { lastUsedAt: at });
      spent = { key: key.id, before: credits.remaining, matched: res.ratings.size };
      report.checked += batch.length;
      report.rated += res.ratings.size;
      report.notFound += batch.length - res.ratings.size;
    }
  } finally {
    running = false;
  }
}
