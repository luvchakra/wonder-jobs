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

/**
 * Push notifications. The payload is written by the server (server/push/subscriptions.ts) and is always
 * this app's own JSON; anything else is shown as a plain nudge rather than dropped, because a
 * notification the browser already woke us for should never be silently swallowed.
 */
self.addEventListener("push", (event) => {
  let payload = { title: "WonderJobs", body: "Something new is waiting for you.", url: "/app" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    const text = event.data && event.data.text();
    if (text) payload.body = text;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag || "wonderjobs",
      data: { url: payload.url || "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Reuse an open tab when there is one — nobody wants a new window per notification.
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
