/**
 * Searchable dropdowns in a background fill (owner decision 2026-10-17, WJ-312). Forms built on React Select
 * and the like keep their choices out of the page until opened, and ignore synthetic events, so the helper
 * script can neither read nor choose them. It marks the one dropdown it needs and asks here; this file then
 * acts on that dropdown only:
 *
 *   - reads its options: focus its own text box, ArrowDown to open the list, read the list, Escape to close;
 *   - chooses an answer: the same, then one click on the single option whose text is exactly the answer the
 *     helper sent (WonderJobs' fill plan: the candidate's own answer). No exact match, no click.
 *
 * For a search-as-you-type dropdown, the answer is typed into that dropdown's own text box to list its choices.
 * Never Enter, never Tab, no other typing, never a click on anything but that option. Every other gesture in the
 * worker is the candidate's own (input.ts). worker.test.ts holds this file to exactly these.
 */
import type { Frame } from "playwright";

const MARK = "data-wonder-combo";
const CHOSEN = "data-wonder-option";

const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();

/** The marked element, only if it is a combobox's own text box; null otherwise. */
async function comboBox(frame: Frame, mark: string) {
  if (!/^[\w-]{1,80}$/.test(mark)) return null;
  const box = frame.locator(`[${MARK}="${mark}"]`);
  if ((await box.count()) !== 1) return null;
  // A combobox's own text box, or Lever's location box (type, then pick a suggestion).
  const ok = await box.evaluate((el) => el.tagName === "INPUT" && (el.getAttribute("role") === "combobox" || el.matches("input[data-qa='location-input']"))).catch(() => false);
  return ok ? box : null;
}

/** The open list's options for the marked dropdown: the list it points at, else the one inside its own widget. */
function listedOptions(frame: Frame, mark: string): Promise<string[]> {
  return frame.evaluate(
    ([attr, m]) => {
      const el = document.querySelector(`[${attr}="${m}"]`);
      if (!el) return [];
      const own = document.getElementById(el.getAttribute("aria-controls") || "");
      let opts: Element[] = own ? Array.from(own.querySelectorAll("[role=option]")) : [];
      let box = el.parentElement;
      for (let i = 0; !opts.length && box && i < 6; i++, box = box.parentElement) opts = Array.from(box.querySelectorAll("[role=option], [class*='__option'], .dropdown-results > *"));
      return opts.filter((o) => !o.closest(".iti")).map((o) => (o.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 290);
    },
    [MARK, mark] as const,
  );
}

async function open(frame: Frame, mark: string): Promise<string[] | null> {
  const box = await comboBox(frame, mark);
  if (!box) return null;
  await box.focus();
  await box.press("ArrowDown");
  for (let i = 0; i < 10; i++) {
    const opts = await listedOptions(frame, mark);
    if (opts.length) return opts;
    await frame.waitForTimeout(80);
  }
  return [];
}

async function close(frame: Frame, mark: string) {
  const box = await comboBox(frame, mark);
  if (box) await box.press("Escape").catch(() => undefined);
}

/** The dropdown's choices, read once: open, read, close. */
export async function comboOptions(frame: Frame, mark: string): Promise<string[]> {
  const opts = await open(frame, mark);
  if (opts === null) return [];
  await close(frame, mark);
  return opts;
}

/**
 * Which listed option is the answer: the one whose text is exactly it, else — for a value like a city — the one
 * option that begins with it ("Bengaluru" → "Bengaluru, Karnataka, India"). More than one candidate: none.
 */
export function optionFor(opts: string[], value: string): string | null {
  const want = norm(value);
  const exact = opts.filter((o) => norm(o) === want);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const prefix = opts.filter((o) => norm(o).startsWith(`${want},`) || norm(o).startsWith(`${want} `));
  if (prefix.length) return prefix.length === 1 ? prefix[0] : null;
  // "Bengaluru, India" → "Bengaluru, Karnataka, India": starts with the first part and holds every other part.
  const parts = want.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const spread = opts.filter((o) => norm(o).startsWith(parts[0]) && parts.every((x) => norm(o).includes(x)));
  return spread.length === 1 ? spread[0] : null;
}

/**
 * Choose the option that is the answer (optionFor). `ok` when it was chosen; nothing is pressed otherwise, and the
 * choices the dropdown listed come back so WonderJobs can ask the candidate with them.
 */
export async function comboPick(frame: Frame, mark: string, value: string): Promise<{ ok: boolean; options?: string[] }> {
  if (typeof value !== "string" || !value.trim() || value.length > 500) return { ok: false };
  const opts = await open(frame, mark);
  if (!opts) return { ok: false };
  let target = optionFor(opts, value);
  let found: string[] = opts;
  if (!target) {
    // A search-as-you-type dropdown (a city, a school): its choices appear for what's typed in its own box.
    const box = await comboBox(frame, mark);
    if (!box) return { ok: false };
    // Typed key by key: some (Lever's location box) search only on key presses, not on pasted text.
    await box.fill("");
    // A place is searched by its first part ("Bengaluru, Karnataka, IND" → "Bengaluru"); the pick is still exact.
    const query = value.split(",")[0].trim() || value;
    await box.pressSequentially(query, { delay: 40 });
    for (let i = 0; i < 15 && !target; i++) {
      await frame.waitForTimeout(250);
      found = await listedOptions(frame, mark);
      target = optionFor(found, value);
    }
    if (!target) {
      await box.fill("");
      await close(frame, mark);
      return { ok: false, options: found.slice(0, 50) };
    }
  }
  const want = norm(target);
  // Mark that one option in the open list, then press it — the only click this file makes.
  const marked = await frame.evaluate(
    ([attr, chosen, m, w]) => {
      document.querySelectorAll(`[${chosen}]`).forEach((o) => o.removeAttribute(chosen));
      const el = document.querySelector(`[${attr}="${m}"]`);
      if (!el) return false;
      const own = document.getElementById(el.getAttribute("aria-controls") || "");
      let opts: Element[] = own ? Array.from(own.querySelectorAll("[role=option]")) : [];
      let box = el.parentElement;
      for (let i = 0; !opts.length && box && i < 6; i++, box = box.parentElement) opts = Array.from(box.querySelectorAll("[role=option], [class*='__option'], .dropdown-results > *"));
      const hit = opts.filter((o) => !o.closest(".iti")).filter((o) => (o.textContent || "").replace(/\s+/g, " ").trim().toLowerCase() === w);
      if (hit.length !== 1) return false;
      hit[0].setAttribute(chosen, "1");
      return true;
    },
    [MARK, CHOSEN, mark, want] as const,
  );
  if (!marked) {
    await close(frame, mark);
    return { ok: false, options: found.slice(0, 50) };
  }
  await frame.locator(`[${CHOSEN}="1"]`).click({ timeout: 3000 });
  return { ok: true };
}
