/**
 * WonderJobs service worker — installability only, deliberately not a cache.
 *
 * This app is local-first with its own sync/dirty-tracking layer
 * (store/remoteStorage.ts) so every screen already reflects real,
 * current state. A caching service worker here would risk serving a
 * stale job list, a stale run, or stale application status — exactly
 * what that layer exists to prevent — so this one caches nothing.
 * It exists only so the app can be installed as a PWA, and it shows a
 * small, honest offline page (no fabricated data) when the network is
 * down for a page navigation.
 */

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>You're offline · WonderJobs</title>
<style>
  body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f6f6fb; color: #14142b; }
  main { max-width: 360px; text-align: center; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { font-size: 14px; color: #3f4160; line-height: 1.5; margin: 0 0 20px; }
  button { border: none; border-radius: 999px; padding: 10px 20px; font-size: 14px; font-weight: 600;
    color: #fff; background: linear-gradient(135deg, #6d4cf5 0%, #7c5cff 55%, #a66bff 100%); cursor: pointer; }
</style></head>
<body><main>
  <h1>You're offline</h1>
  <p>WonderJobs needs a connection to show your real data — nothing here is cached or faked. Reconnect and try again.</p>
  <button onclick="location.reload()">Retry</button>
</main></body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // API calls, assets, etc. pass straight through.
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
    ),
  );
});
