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
 * What a company Explorium matches costs, in credits (owner, 2026-10-24: "stick to 2 credits per company"): the
 * figure on Explorium's usage page for the ratings enrichment. Batches are sized by it. The job asks only for
 * ratings, never another enrichment. If Explorium ever reports a higher price for a batch (its own `credit_usage`,
 * not a guess from the balance, which other use of the account also moves), the job notes it and carries on.
 */
export const CREDITS_PER_COMPANY = 2;

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
  /** Things worth knowing that didn't stop the job (a batch Explorium priced above 2 credits a company). */
  notes: string[];
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
  const report: RatingsRunReport = { status: "complete", checked: 0, rated: 0, notFound: 0, retired: [], keysLeft: 0, left: 0, message: "", notes: [] };
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
    let cost = CREDITS_PER_COMPANY;
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

      // Ask for as many companies as the credits can pay for at the cost per company — and if Explorium still says
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
      // Explorium's own account of what the batch cost. Above 2 a company: say so, size the next batches by it, go on.
      if (res.usage) {
        const each = res.usage.credits / res.usage.results;
        if (each > cost) {
          cost = Math.ceil(each);
          const note = `Explorium charged ${Math.round(each * 10) / 10} credits per company on a batch, above the ${CREDITS_PER_COMPANY} expected.`;
          if (!report.notes.includes(note)) report.notes.push(note);
        }
      }
      report.checked += batch.length;
      report.rated += res.ratings.size;
      report.notFound += batch.length - res.ratings.size;
    }
  } finally {
    running = false;
  }
}
