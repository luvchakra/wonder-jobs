"use client";
import { useEffect, useRef } from "react";
import { useJobsStore } from "@/store/jobs";
import { useAuthStore } from "@/store/auth";
import type { LinkCheck } from "@/server/jobs/linkCheck";

const RECHECK_MS = 6 * 3_600_000;
const BATCH = 25;

/** "closed on stripe.com: the posting's page says …" */
export const closedReason = (url: string, reason?: string) => {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  return `Closed on ${host}${reason ? `: ${reason}` : ""}`;
};

async function check(urls: string[]): Promise<Record<string, LinkCheck>> {
  const res = await fetch("/api/jobs/link-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls }) });
  if (!res.ok) return {};
  return ((await res.json()) as { results: Record<string, LinkCheck> }).results;
}

/**
 * Checks that the jobs on screen still open on their own sites, a batch at a time, and takes the ones
 * that have closed off the list. Signed-in only (the demo's sample postings aren't real pages). A job
 * whose link was found open in the last 6 hours isn't checked again; one that can't be told stays.
 */
export function useLinkCheck(jobIds: string[]) {
  const mode = useAuthStore((s) => s.mode);
  const inFlight = useRef(new Set<string>());
  const key = jobIds.join(",");
  useEffect(() => {
    if (mode !== "user" || !jobIds.length) return;
    const { jobs, linkOpenAt, closed } = useJobsStore.getState();
    const due = jobIds.filter((id) => jobs[id]?.applyUrl && !closed[id] && !inFlight.current.has(id) && !(linkOpenAt[id] && Date.now() - Date.parse(linkOpenAt[id]) < RECHECK_MS)).slice(0, BATCH);
    if (!due.length) return;
    due.forEach((id) => inFlight.current.add(id));
    const urlFor = new Map(due.map((id) => [id, jobs[id].applyUrl]));
    void check([...new Set(urlFor.values())])
      .then((results) => {
        const store = useJobsStore.getState();
        const open: string[] = [];
        for (const [id, url] of urlFor) {
          const r = results[url];
          if (r?.status === "closed") store.markClosed(id, closedReason(url, r.reason));
          else if (r?.status === "open") open.push(id);
        }
        if (open.length) store.markLinkOpen(open);
      })
      .catch(() => {})
      .finally(() => due.forEach((id) => inFlight.current.delete(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when the set of jobs on screen changes
  }, [mode, key]);
}

/** One job's link, checked when its page opens (and the result kept like the list's). */
export async function checkOneJobLink(jobId: string): Promise<LinkCheck | null> {
  const { jobs, linkOpenAt } = useJobsStore.getState();
  const url = jobs[jobId]?.applyUrl;
  if (!url) return null;
  if (linkOpenAt[jobId] && Date.now() - Date.parse(linkOpenAt[jobId]) < RECHECK_MS) return { status: "open" };
  const r = (await check([url]).catch(() => ({}) as Record<string, LinkCheck>))[url] ?? null;
  if (r?.status === "closed") useJobsStore.getState().markClosed(jobId, closedReason(url, r.reason));
  if (r?.status === "open") useJobsStore.getState().markLinkOpen([jobId]);
  return r;
}
