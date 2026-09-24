/**
 * Runs on WonderJobs' own pages, where the session cookie works. Mints a
 * short-lived bearer token and hands it to the service worker, so the
 * extension can read the candidate's prepared materials later from an
 * employer's site — where that cookie can't go.
 *
 * Silent by design: no prompt, nothing rendered. If nobody is signed in the
 * request 401s and the extension simply stays disconnected.
 */
(async () => {
  try {
    const res = await fetch(`${location.origin}/api/extension/token`, { credentials: "include", cache: "no-store" });
    if (!res.ok) return;
    const body = await res.json();
    if (!body?.token) return;
    await chrome.runtime.sendMessage({ type: "storeToken", payload: { origin: location.origin, token: body.token, expiresAt: body.expiresAt } });
    // Let the page know, so the install/connect CTA can show "connected" without a reload.
    window.dispatchEvent(new CustomEvent("wonderjobs:extension-connected"));
  } catch {
    // The page is open but the API isn't reachable — nothing to do; the popup will say "not connected".
  }
})();

/**
 * The web app asks "is the extension installed?" by dispatching this event;
 * answering it is the only thing the page can get from the extension.
 */
window.addEventListener("wonderjobs:extension-ping", () => {
  window.dispatchEvent(new CustomEvent("wonderjobs:extension-pong", { detail: { version: chrome.runtime.getManifest().version } }));
});

/**
 * Apply with Wonder pairing. The page asks with a session id only; this script fetches the
 * session-scoped helper token itself, with the candidate's own cookie, and hands it straight to the
 * service worker. The token never passes through the page's own scripts or any URL.
 */
window.addEventListener("wonderjobs:jobsapply-pair", async (event) => {
  const sessionId = event?.detail?.sessionId;
  const reply = (ok, reason) => window.dispatchEvent(new CustomEvent("wonderjobs:jobsapply-paired", { detail: { sessionId, ok, reason } }));
  if (typeof sessionId !== "string" || !/^jas_[\w-]{6,40}$/.test(sessionId)) return reply(false, "Not a session id.");
  try {
    const res = await fetch(`${location.origin}/api/jobs-apply/sessions/${encodeURIComponent(sessionId)}/token`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}", cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.token) return reply(false, body?.error?.message ?? "WonderJobs refused the connection.");
    const r = await chrome.runtime.sendMessage({ type: "jobsApplyPair", payload: { origin: location.origin, sessionId, token: body.token, expiresAt: body.expiresAt, destination: body.destination } });
    reply(!!r?.ok, r?.ok ? undefined : "The helper couldn't store the connection.");
  } catch {
    reply(false, "WonderJobs couldn't be reached.");
  }
});
