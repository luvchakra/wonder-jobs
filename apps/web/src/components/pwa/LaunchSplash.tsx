/**
 * The launch splash (owner, 2026-11-28: "show a nice splash animation when the app opens up from the home page of the
 * device"): when WonderWorks is opened as the installed app (from the home screen, not a browser tab), the mark grows
 * in with a soft glow and the wordmark rises under it, then the whole screen fades away — about a second, once per
 * launch. Nothing waits on it: the app loads underneath meanwhile.
 *
 * It runs before anything paints, from a tiny inline script (`SPLASH_EARLY`), so the app never flashes first; the
 * markup below is in every page but hidden unless the script marked `<html data-splash>`. Reduced motion gets a still
 * mark for a moment. No React, so a slow hydration can't hold it on screen.
 */
export const SPLASH_EARLY = `(function(){try{var w=window,r=document.documentElement;var app=(w.matchMedia&&w.matchMedia("(display-mode: standalone)").matches)||w.navigator.standalone===true;if(!app||sessionStorage.getItem("wj.splash"))return;sessionStorage.setItem("wj.splash","1");r.setAttribute("data-splash","");var still=w.matchMedia&&w.matchMedia("(prefers-reduced-motion: reduce)").matches;setTimeout(function(){r.setAttribute("data-splash","out");setTimeout(function(){r.removeAttribute("data-splash")},400)},still?500:1300)}catch(e){}})();`;

export function LaunchSplash() {
  return (
    <div id="wj-splash" aria-hidden="true">
      <div className="wj-splash-glow" />
      {/* Plain <img>: it must load at once, with no Next image loader in the way. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="wj-splash-mark" src="/brand/wonderstar-mark.svg" alt="" width={120} height={100} />
      <p className="wj-splash-word">
        Wonder<span className="wj-gradient-text">Works</span>
      </p>
    </div>
  );
}
