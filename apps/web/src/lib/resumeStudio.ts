export type StudioTab = "templates" | "mine";

/** Resume Studio opens on My resumes; Templates opens with `?tab=templates`, or when preparing a résumé for a job (`?job=`). */
export function studioTab(params: { get(name: string): string | null }): StudioTab {
  const t = params.get("tab");
  if (t === "templates" || t === "mine") return t;
  return params.get("job") ? "templates" : "mine";
}
