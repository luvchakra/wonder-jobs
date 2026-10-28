/**
 * WonderStar service worker — installability only, deliberately not a cache.
 *
 * This app is local-first with its own sync/dirty-tracking layer
 * (store/remoteStorage.ts) so every screen already reflects real,
 * current state. A caching service worker here would risk serving a
 * stale job list, a stale run, or stale application status — exactly
 * what that layer exists to prevent — so this one caches nothing.
 * It exists only so the app can be installed as a PWA, and it shows a
 * small, honest page (no fabricated data) when a page can't be fetched even on
 * a second try, saying whether the device is offline or WonderStar isn't answering.
 */

/**
 * Shown only when the page itself can't be fetched, after a second try. It says which it is — no connection
 * on this device, or WonderStar not answering (a moment's blip, or the app updating) — and, while the page is
 * open, keeps trying by itself and reloads as soon as WonderStar answers. Nothing here is cached or invented.
 */
const UNREACHABLE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Can't reach WonderStar</title>
<style>
  body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f6f6fb; color: #14142b; }
  main { max-width: 360px; text-align: center; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { font-size: 14px; color: #3f4160; line-height: 1.5; margin: 0 0 20px; }
  small { display: block; font-size: 12px; color: #6b6d8a; margin-top: 14px; }
  button { border: none; border-radius: 999px; padding: 10px 20px; font-size: 14px; font-weight: 600;
    color: #fff; background: linear-gradient(135deg, #6d4cf5 0%, #7c5cff 55%, #a66bff 100%); cursor: pointer; }
</style></head>
<body><main>
  <h1 id="t">Can't reach WonderStar right now</h1>
  <p id="m">WonderStar may be updating — that takes a minute or two. Your saved jobs and searches are safe. We'll keep trying and open it as soon as it's back.</p>
  <button onclick="location.reload()">Try again now</button>
  <small id="s">Trying again in a few seconds…</small>
</main>
<script>
  var offline = navigator.onLine === false;
  function say() {
    offline = navigator.onLine === false;
    document.getElementById("t").textContent = offline ? "You're offline" : "Can't reach WonderStar right now";
    document.getElementById("m").textContent = offline
      ? "Your phone has no connection. Check Wi-Fi or mobile data — WonderStar opens again as soon as you're back online."
      : "WonderStar may be updating — that takes a minute or two. Your saved jobs and searches are safe. We'll keep trying and open it as soon as it's back.";
  }
  say();
  addEventListener("online", function () { location.reload(); });
  addEventListener("offline", say);
  var wait = 5000;
  function check() {
    if (document.visibilityState !== "visible" || navigator.onLine === false) return setTimeout(check, wait);
    fetch(location.href, { method: "HEAD", cache: "no-store" }).then(function (r) {
      if (r.ok || r.status < 500) location.reload();
      else setTimeout(check, (wait = Math.min(wait * 2, 60000)));
    }, function () { setTimeout(check, (wait = Math.min(wait * 2, 60000))); });
  }
  setTimeout(check, wait);
</script></body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** The page as the network gives it; a failed attempt (a dropped connection, a blip) is tried once more first. */
async function navigate(request) {
  try {
    return await fetch(request);
  } catch {
    await new Promise((r) => setTimeout(r, 1200));
    try {
      return await fetch(request);
    } catch {
      return new Response(UNREACHABLE_HTML, { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // API calls, assets, etc. pass straight through.
  event.respondWith(navigate(event.request));
});

/**
 * Push notifications. The payload is written by the server (server/push/subscriptions.ts) and is always
 * this app's own JSON; anything else is shown as a plain nudge rather than dropped, because a
 * notification the browser already woke us for should never be silently swallowed.
 */
self.addEventListener("push", (event) => {
  let payload = { title: "WonderStar", body: "Something new is waiting for you.", url: "/app" };
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
