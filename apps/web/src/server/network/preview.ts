/**
 * What a post's attached listing looks like in the feed (owner, 2026-11-21: "instead of showing just one line of linked
 * post, make it richer, show more content"): the listing as its public page shows it now (title, its facts, the start
 * of its description and its preview image). Only public listing pages, read the same way that page reads them; nothing
 * from anyone's account.
 */
import { shareFacts } from "@/domain/jobs/share";
import { distinctText, excerpt } from "@/wonderworks/listing/share";
import { lookupJobs } from "../jobs/recover";
import { sharedListing } from "../share/listing";

export interface ListingPreview {
  page: string;
  module: string;
  title: string;
  /** Who it's from (a company, school or seller), when the listing names one. */
  by?: string;
  facts: string;
  summary: string;
  /** The listing's preview image (its public page's card). */
  image: string;
}

const JOB = /^\/j\/([A-Za-z0-9_.~%-]{1,160})$/;
const LISTING = /^\/s\/([a-z]{2,20})\/([A-Za-z0-9_.~%-]{1,160})$/;

export async function listingPreview(page: string): Promise<ListingPreview | null> {
  const j = JOB.exec(page);
  if (j) {
    const [job] = await lookupJobs([decodeURIComponent(j[1])]).catch(() => []);
    if (!job) return null;
    return { page, module: "jobs", title: job.title, by: job.company || undefined, facts: shareFacts(job), summary: excerpt(distinctText(job.title, job.description), 280), image: `${page}/opengraph-image` };
  }
  const s = LISTING.exec(page);
  if (!s) return null;
  const l = await sharedListing(s[1], s[2]).catch(() => null);
  if (!l) return null;
  const facts = (l.facts ?? []).filter((f): f is string => typeof f === "string" && !!f);
  return { page, module: l.module, title: l.title, facts: facts.slice(0, 4).join(" · "), summary: excerpt(distinctText(l.title, l.details), 280), image: `${page}/opengraph-image` };
}
