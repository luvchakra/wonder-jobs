import { notFound } from "next/navigation";
import { modulePages } from "@/modules/pages";
import { shellTab } from "../../shell";

type Params = { params: Promise<{ module: string; id: string }> };

/** One item in a module's Pipeline tab; a module without an item page is a 404. */
export default async function ModulePipelineItemPage(p: Params) {
  const { Item } = modulePages(await shellTab(p, "pipeline"));
  if (!Item) notFound();
  return <Item id={decodeURIComponent((await p.params).id)} />;
}
