/**
 * The script run in every page of a cloud session: the WonderJobs helper — the very same
 * `extension/content/autofill.js` the Chrome extension ships — behind a small `chrome.runtime` shim.
 *
 * The helper reads the form's structure, asks WonderJobs what may be filled, fills exactly that, and
 * never submits (the app's own unit test scans it for anything that clicks or submits). The shim only
 * routes its messages: `chrome.runtime.sendMessage` → the worker (`__wonderAsk`, exposed by Playwright),
 * and messages to the page (`fillNow`, `jobsApplyPaired`) → the helper's listeners (`__wonderDeliver`).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Where the helper's source lives: the image copies it next to `dist/`; a checkout has the extension itself. */
export function helperSourcePath(): string {
  const candidates = [process.env.WONDER_HELPER_SCRIPT, path.resolve(here, "../helper/autofill.js"), path.resolve(here, "../../../extension/content/autofill.js")].filter((p): p is string => !!p);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`WonderJobs helper script not found (looked in ${candidates.join(", ")})`);
  return found;
}

export const SHIM = `(() => {
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.__wonder) return;
  const listeners = [];
  const runtime = {
    __wonder: true,
    sendMessage: (m) => window.__wonderAsk(JSON.stringify(m)).then((r) => (r == null ? null : JSON.parse(r))),
    onMessage: { addListener: (fn) => listeners.push(fn) },
  };
  window.chrome = Object.assign(window.chrome || {}, { runtime });
  window.__wonderDeliver = (m) => listeners.forEach((fn) => { try { fn(m, null, () => {}); } catch {} });
})();
`;

let cached: string | null = null;
export function pageScript(): string {
  if (!cached) cached = SHIM + readFileSync(helperSourcePath(), "utf8");
  return cached;
}
