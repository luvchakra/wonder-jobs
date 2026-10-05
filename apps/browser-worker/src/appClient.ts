/**
 * The helper's line to WonderJobs: the same five session routes the Chrome extension's background
 * script may call, with the session's bearer token, and nothing else. The worker holds no other
 * credential for the app, and the token only ever reaches this one session's helper.
 */
const ALLOWED = /^\/api\/jobs-apply\/extension\/(session|inspect|fill-plan|events|file)(\?kind=(resume|cover_letter))?$/;

export type HelperReply = { data: unknown; approvedDomains?: string[] } | { error: string; status?: number; data?: unknown };

export function allowedHelperPath(path: unknown): path is string {
  return typeof path === "string" && ALLOWED.test(path);
}

export async function jobsApplyCall(appOrigin: string, token: string, path: unknown, method = "GET", body?: unknown): Promise<HelperReply> {
  if (!allowedHelperPath(path)) return { error: "not_allowed" };
  let res: Response;
  try {
    res = await fetch(`${appOrigin}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { error: "network" };
  }
  if (res.status === 401) return { error: "revoked" };
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) return { error: "request_failed", status: res.status, data };
  const approved = (data as { approvedDomains?: unknown })?.approvedDomains;
  return { data, ...(Array.isArray(approved) ? { approvedDomains: approved.filter((d): d is string => typeof d === "string") } : {}) };
}

/** `host` is `domain` or a subdomain of it. */
export function hostMatches(host: string, domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  return host === d || host.endsWith(`.${d}`);
}
