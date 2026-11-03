/**
 * Source names as a card shows them, in every module (owner, 2026-11-01: "instead of writing full name in the card,
 * just mention WWDG"; renamed 2026-11-02: "change it to WorksLakeDG"): "WorksLake Data Gateway · Teaching" reads "WorksLakeDG". Admin pages and listing pages keep the full name. A plain module (no "use client"), so server share text can use it too.
 */
export function shortSourceNames(text: string): string {
  return text.replace(/WorksLake Data Gateway(?: · [^·,+]+?)?(?=\s*(?:\+\d|·|,|$))/g, "WorksLakeDG");
}
