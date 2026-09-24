/**
 * Service worker: the only place that holds the WonderJobs bearer token and
 * the only place that talks to the WonderJobs API. Content scripts on
 * employers' sites ask it for data by message, so a page never sees the token.
 */
import { WONDERJOBS_ORIGINS } from "./config.js";

const STORAGE_KEY = "wj.connection";

async function readConnection() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] ?? null;
}

async function writeConnection(connection) {
  await chrome.storage.local.set({ [STORAGE_KEY]: connection });
}

/** A token with at least a minute left on it, or null — the bridge content script refreshes it whenever a WonderJobs tab is open. */
async function liveConnection() {
  const connection = await readConnection();
  if (!connection?.token) return null;
  if ((connection.expiresAt ?? 0) * 1000 <= Date.now() + 60_000) return null;
  return connection;
}

/**
 * Ask WonderJobs for a fresh token without a tab being involved. This only
 * works while the browser still has a valid WonderJobs session cookie, which
 * is exactly the "reuse your existing sign-in" model — no separate password,
 * no long-lived secret stored here.
 */
async function refreshFromSession() {
  for (const origin of WONDERJOBS_ORIGINS) {
    try {
      const res = await fetch(`${origin}/api/extension/token`, { credentials: "include", cache: "no-store" });
      if (!res.ok) continue;
      const body = await res.json();
      if (!body?.token) continue;
      const connection = { origin, token: body.token, expiresAt: body.expiresAt, connectedAt: Date.now() };
      await writeConnection(connection);
      return connection;
    } catch {
      // That origin isn't reachable (nobody runs the app locally, say) — try the next one.
    }
  }
  return null;
}

async function connection() {
  return (await liveConnection()) ?? (await refreshFromSession());
}

async function api(path) {
  const conn = await connection();
  if (!conn) return { error: "not_connected" };
  const res = await fetch(`${conn.origin}${path}`, { headers: { authorization: `Bearer ${conn.token}` }, cache: "no-store" });
  if (res.status === 401) {
    // The token aged out between checks; one retry with a fresh one.
    const fresh = await refreshFromSession();
    if (!fresh) return { error: "not_connected" };
    const retry = await fetch(`${fresh.origin}${path}`, { headers: { authorization: `Bearer ${fresh.token}` }, cache: "no-store" });
    if (!retry.ok) return { error: "request_failed", status: retry.status };
    return { data: await retry.json() };
  }
  if (!res.ok) return { error: "request_failed", status: res.status };
  return { data: await res.json() };
}

/* -------------------------------------------------------------- JobsApply */

/**
 * Apply with Wonder sessions this browser is paired with. Each holds a *session-scoped* token
 * (tenant + session + nonce, 30 minutes) that only this worker ever sees: content scripts ask the
 * worker to call WonderJobs on their behalf, and only the JobsApply helper endpoints are allowed.
 */
const SESSIONS_KEY = "wj.jobsapply.sessions";
const JOBSAPPLY_PATHS = /^\/api\/jobs-apply\/extension\/(session|inspect|fill-plan|events|file)(\?kind=(resume|cover_letter))?$/;

async function readSessions() {
  const stored = await chrome.storage.local.get(SESSIONS_KEY);
  const all = stored[SESSIONS_KEY] ?? {};
  const now = Date.now() / 1000;
  for (const [id, s] of Object.entries(all)) if (!s?.token || s.expiresAt <= now) delete all[id];
  return all;
}
async function writeSessions(all) {
  await chrome.storage.local.set({ [SESSIONS_KEY]: all });
}

const hostMatches = (host, domain) => host === domain || host.endsWith(`.${domain}`);

/** The paired session whose destination (or a related / approved host) this page is on. */
async function sessionFor(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const all = await readSessions();
  const hits = Object.values(all).filter((s) => [s.domain, ...(s.relatedDomains ?? []), ...(s.approvedDomains ?? [])].some((d) => d && hostMatches(host, d)));
  hits.sort((a, b) => (b.pairedAt ?? 0) - (a.pairedAt ?? 0));
  return hits[0] ?? null;
}

async function injectInto(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["content/autofill.js"] });
    return true;
  } catch {
    return false; // no permission for that host yet, or a page scripts can't run on
  }
}

/** On a paired session's destination that isn't in the static content-script list, inject the helper — only where the candidate granted access. */
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== "complete" || !tab.url || !/^https:/.test(tab.url)) return;
  const s = await sessionFor(tab.url);
  if (!s) return;
  const origin = new URL(tab.url).origin;
  const granted = await chrome.permissions.contains({ origins: [`${origin}/*`] });
  await chrome.action.setBadgeText({ tabId, text: granted ? "" : "!" });
  if (granted) await injectInto(tabId);
});

async function jobsApplyCall({ sessionId, path, method = "GET", body }) {
  if (typeof path !== "string" || !JOBSAPPLY_PATHS.test(path)) return { error: "not_allowed" };
  const all = await readSessions();
  const s = all[sessionId];
  if (!s) return { error: "not_connected" };
  let res;
  try {
    res = await fetch(`${s.origin}${path}`, { method, headers: { authorization: `Bearer ${s.token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, cache: "no-store" });
  } catch {
    return { error: "network" };
  }
  if (res.status === 401) {
    // Expired, stopped from WonderJobs, or ended: forget the token. Reopening from WonderJobs pairs again.
    delete all[sessionId];
    await writeSessions(all);
    return { error: "revoked" };
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) return { error: "request_failed", status: res.status, data };
  if (data?.approvedDomains && all[sessionId]) {
    all[sessionId].approvedDomains = data.approvedDomains;
    await writeSessions(all);
  }
  return { data };
}

const handlers = {
  /** Called by the bridge content script running on WonderJobs itself. */
  async storeToken({ origin, token, expiresAt }) {
    if (!token || !origin) return { ok: false };
    await writeConnection({ origin, token, expiresAt, connectedAt: Date.now() });
    return { ok: true };
  },
  async status() {
    const conn = await connection();
    if (!conn) return { connected: false };
    const profile = await api("/api/extension/profile");
    if (profile.error) return { connected: false };
    return { connected: true, origin: conn.origin, profile: profile.data };
  },
  async profile() {
    return api("/api/extension/profile");
  },
  async application({ url }) {
    return api(`/api/extension/application?url=${encodeURIComponent(url)}`);
  },
  async disconnect() {
    await chrome.storage.local.remove([STORAGE_KEY, SESSIONS_KEY]);
    return { ok: true };
  },
  /** From the bridge on WonderJobs: a session token minted with the candidate's own cookie. */
  async jobsApplyPair({ origin, sessionId, token, expiresAt, destination }) {
    if (!origin || !sessionId || !token || !destination?.domain) return { ok: false };
    const all = await readSessions();
    all[sessionId] = { origin, sessionId, token, expiresAt, domain: destination.domain, relatedDomains: destination.relatedDomains ?? [], approvedDomains: [], pairedAt: Date.now() };
    await writeSessions(all);
    // A tab already on the destination (opened before pairing finished) picks the session up now.
    const tabs = await chrome.tabs.query({});
    for (const t of tabs) {
      if (t.id && t.url && (await sessionFor(t.url))?.sessionId === sessionId) chrome.tabs.sendMessage(t.id, { type: "jobsApplyPaired", sessionId }).catch(() => injectInto(t.id));
    }
    return { ok: true };
  },
  async jobsApplyFor({ url }) {
    const s = await sessionFor(url);
    return s ? { sessionId: s.sessionId } : null;
  },
  jobsApplyCall,
  /** For the popup: is this tab an Apply with Wonder destination, and may the helper run here? */
  async tabStatus({ url }) {
    const s = url ? await sessionFor(url) : null;
    if (!s) return { session: false };
    const origin = new URL(url).origin;
    return { session: true, origin, granted: await chrome.permissions.contains({ origins: [`${origin}/*`] }) };
  },
  async injectTab({ tabId }) {
    return { ok: await injectInto(tabId) };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;
  handler(message.payload ?? {})
    .then(sendResponse)
    .catch((error) => sendResponse({ error: "failed", detail: String(error?.message ?? error) }));
  return true; // keep the message channel open for the async reply
});
