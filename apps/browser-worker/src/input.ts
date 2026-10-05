/**
 * The candidate's own taps, scrolls and typing, relayed into the page they are watching. This is the
 * only file in the worker that drives the page: every event here originates from the candidate's
 * client (a stream message), and nothing here acts on its own. Wonder fills fields through the helper
 * script's value-setting, never through these.
 */
import type { Page } from "playwright";

/** Keys the client may send by name; anything else is typed as text through `insertText`. */
export const KEYS = new Set(["Enter", "Backspace", "Tab", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete"]);

export type InputMessage = { t: "tap"; x: number; y: number } | { t: "scroll"; x: number; y: number; dy: number } | { t: "text"; text: string } | { t: "key"; key: string };

export function parseInput(raw: unknown, viewport: { width: number; height: number }): InputMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : null);
  if (m.t === "tap") {
    const x = num(m.x, viewport.width), y = num(m.y, viewport.height);
    return x === null || y === null ? null : { t: "tap", x, y };
  }
  if (m.t === "scroll") {
    const x = num(m.x, viewport.width), y = num(m.y, viewport.height);
    const dy = typeof m.dy === "number" && Number.isFinite(m.dy) ? Math.min(4000, Math.max(-4000, m.dy)) : null;
    return x === null || y === null || dy === null ? null : { t: "scroll", x, y, dy };
  }
  if (m.t === "text") return typeof m.text === "string" && m.text.length > 0 && m.text.length <= 4000 ? { t: "text", text: m.text } : null;
  if (m.t === "key") return typeof m.key === "string" && KEYS.has(m.key) ? { t: "key", key: m.key } : null;
  return null;
}

export async function relayInput(page: Page, msg: InputMessage): Promise<void> {
  switch (msg.t) {
    case "tap":
      await page.mouse.click(msg.x, msg.y);
      return;
    case "scroll":
      await page.mouse.move(msg.x, msg.y);
      await page.mouse.wheel(0, msg.dy);
      return;
    case "text":
      await page.keyboard.insertText(msg.text);
      return;
    case "key":
      await page.keyboard.press(msg.key);
      return;
  }
}
