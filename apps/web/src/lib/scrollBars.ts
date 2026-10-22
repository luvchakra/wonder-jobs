/**
 * Phones: as the page scrolls down the top bar slides away, then the bottom bar; scrolling back brings
 * the bottom bar back first, then the top (owner, 2026-10-22). Both follow the scroll at half its pace,
 * so they move slowly, and when scrolling stops halfway through a bar it settles shown or hidden.
 * `hidden` is how far, in pixels, the two have slid away together: 0 to top + bottom.
 */
export const BAR_PACE = 0.5;

export function slide(hidden: number, delta: number, scrollY: number, top: number, bottom: number): number {
  // At the very top of the page both are always shown.
  if (scrollY <= top) return 0;
  return Math.min(top + bottom, Math.max(0, hidden + delta * BAR_PACE));
}

/** How far each bar has slid away. */
export const offsets = (hidden: number, top: number, bottom: number) => ({ top: Math.min(hidden, top), bottom: Math.min(bottom, Math.max(0, hidden - top)) });

/** Scrolling stopped: a bar caught halfway settles to whichever end it's nearer. */
export function settle(hidden: number, top: number, bottom: number): number {
  const stops = [0, top, top + bottom];
  return stops.reduce((best, s) => (Math.abs(s - hidden) < Math.abs(best - hidden) ? s : best), 0);
}
