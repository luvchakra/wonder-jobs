import { hashKey } from "@/lib/ids";

/**
 * Maps a real application page's URL back to the job id WonderJobs gave that
 * posting, so the extension can ask "do I have prepared materials for the
 * page I'm looking at?" by sending nothing but the URL.
 *
 * The external-id spellings here (`gh:`/`lv:`/`ab:`) and the id formula must
 * stay identical to the ones `server/jobs/providers.ts` writes and
 * `normalizePosting` hashes — `atsUrl.test.ts` pins them against the real
 * fetchers' format.
 */
export interface AtsPosting {
  ats: "greenhouse" | "lever" | "ashby";
  slug: string;
  externalId: string;
}

export function parseAtsUrl(rawUrl: string): AtsPosting | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  // Greenhouse embeds the board and posting in the query instead of the path.
  if (host.endsWith("greenhouse.io")) {
    const embedBoard = url.searchParams.get("for");
    const embedToken = url.searchParams.get("token");
    if (embedBoard && embedToken) return { ats: "greenhouse", slug: embedBoard, externalId: `gh:${embedBoard}:${embedToken}` };
    // boards.greenhouse.io/<slug>/jobs/<id>, job-boards.greenhouse.io/…, job-boards.eu.greenhouse.io/…
    const jobsAt = parts.indexOf("jobs");
    if (jobsAt > 0 && parts[jobsAt + 1]) {
      const slug = parts[jobsAt - 1];
      const id = parts[jobsAt + 1];
      return { ats: "greenhouse", slug, externalId: `gh:${slug}:${id}` };
    }
    return null;
  }

  if (host.endsWith("lever.co")) {
    // jobs.lever.co/<slug>/<id> and the same with a trailing /apply or /thanks
    const [slug, id] = parts;
    if (slug && id) return { ats: "lever", slug, externalId: `lv:${slug}:${id}` };
    return null;
  }

  if (host.endsWith("ashbyhq.com")) {
    // jobs.ashbyhq.com/<slug>/<id>, optionally /application
    const [slug, id] = parts;
    if (slug && id) return { ats: "ashby", slug, externalId: `ab:${slug}:${id}` };
    return null;
  }

  return null;
}

/** The `careers_…` job id WonderJobs would have given the posting at this URL, or null if it isn't an ATS page we read. */
export function jobIdFromAtsUrl(rawUrl: string): string | null {
  const posting = parseAtsUrl(rawUrl);
  return posting ? `careers_${hashKey(`careers:${posting.externalId}`)}` : null;
}
