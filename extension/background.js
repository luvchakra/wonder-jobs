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
    await chrome.storage.local.remove(STORAGE_KEY);
    return { ok: true };
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
