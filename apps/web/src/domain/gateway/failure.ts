/**
 * Why a source didn't go live, in words an admin can act on (owner, 2026-11-05: "make it more descriptive in the ui,
 * it's confusing"). Reads the step and the gateway's own message or code (data-gateway ApiError), never guesses beyond
 * them: an unknown message is shown as it came.
 */
export interface FailureReason {
  /** A short label, the same for every source that failed the same way (the banner groups by it). */
  label: string;
  /** What happened and what to do next, in one or two sentences. */
  detail: string;
}

const STEP: Record<string, string> = { Add: "adding it", Test: "its test", Activate: "switching it on", Collect: "collecting" };

export function explainFailure(step: string | undefined, message: string | undefined): FailureReason {
  const m = (message ?? "").trim();
  const at = step && STEP[step] ? ` (during ${STEP[step]})` : "";
  const responded = /responded (\d{3})/i.exec(m)?.[1];
  if (/found no valid listings/i.test(m) || /^EMPTY$/.test(m))
    return { label: "Found nothing", detail: `The site answered, but the test found no listings it could use${at}: the page layout may have changed, or the site lists none right now. It stays paused; its Test & activate tries again.` };
  if (/SOURCE_TIMEOUT|timed? ?out|didn't answer|aborted|FUNCTION_INVOCATION_TIMEOUT|\b504\b/i.test(m))
    return { label: "Took too long", detail: `The site didn't answer in the time one step is allowed${at}. The next import tries it again.` };
  if (responded === "401" || responded === "403" || /\bFORBIDDEN\b/.test(m))
    return { label: "Site refused us", detail: `The site answered ${responded ?? "403"}${at}: it blocks automated requests from our server. WonderWorks never gets around a block, so this source stays off unless the site allows us.` };
  if (responded === "429" || /RATE_LIMITED|rate limit/i.test(m))
    return { label: "Rate limited", detail: `The site asked us to slow down (429)${at}. The next import tries again.` };
  if (responded === "404" || responded === "410")
    return { label: "Address not found", detail: `The source's address answered ${responded}${at}: the page or feed has moved. Its catalogue entry needs the new address.` };
  if (responded && responded.startsWith("5"))
    return { label: "Site error", detail: `The site had an error (${responded})${at}. The next import tries again.` };
  if (/ROBOTS_DENIED|robots.*(disallow|denied)/i.test(m))
    return { label: "Robots.txt says no", detail: `The site's robots.txt doesn't allow these pages${at}, so they aren't read.` };
  if (/ROBOTS_UNAVAILABLE|verify robots/i.test(m))
    return { label: "Robots.txt didn't load", detail: `The site's robots.txt couldn't be read${at}, and pages aren't crawled without it. Often the site blocks our server; the next import tries again.` };
  if (/UNSAFE_REDIRECT|redirect/i.test(m))
    return { label: "Redirects to another site", detail: `The source's address sends us to a different website${at}, which the gateway doesn't follow. Its catalogue entry needs the address it ends up at.` };
  if (/TOO_LARGE|size limit|too large/i.test(m))
    return { label: "Feed too large", detail: `The site's feed is bigger than the gateway reads in one go${at}. Its catalogue entry needs a smaller feed or a page limit.` };
  if (/SOURCE_NOT_PERMITTED|permission|robots review/i.test(m))
    return { label: "Permission details missing", detail: `The source's entry is missing a required permission note (terms, robots review)${at}. Its catalogue entry needs it filled in.` };
  if (/INVALID_SOURCE|INVALID_REQUEST|mapping|invalid/i.test(m))
    return { label: "Couldn't read the data", detail: `The site answered in a shape the source's settings don't match${at}: ${m}. Its catalogue entry needs updating.` };
  if (/VALIDATION_REQUIRED|test within 24h/i.test(m))
    return { label: "Test expired", detail: "It can only be switched on within a day of a passing test. Its Test & activate runs both again." };
  if (/NOT_CONFIGURED|not configured/i.test(m))
    return { label: "Gateway not set up", detail: "The data gateway isn't configured on this deployment." };
  if (/needs setup|api key|credential/i.test(m))
    return { label: "Needs a key", detail: `This source needs a key${at}. Set it on Admin → Keys, then try again.` };
  if (/fetch failed|ENOTFOUND|ECONNRE|unreachable|SOURCE_UNAVAILABLE|socket/i.test(m))
    return { label: "Couldn't reach the site", detail: `The site didn't respond${at}. The next import tries again.` };
  return { label: "Didn't go live", detail: m ? `${step ? `${step}: ` : ""}${m}` : `It stopped${at} without a reason.` };
}

/** "9 took too long, 4 site refused us": the banner's one line, most common first. */
export function failureSummary(items: { status: string; step?: string; message?: string }[]): string {
  const counts = new Map<string, number>();
  for (const i of items) if (i.status === "failed") {
    const l = explainFailure(i.step, i.message).label;
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${n} ${l.toLowerCase()}`).join(", ");
}
