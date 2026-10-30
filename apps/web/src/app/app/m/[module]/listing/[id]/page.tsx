import { notFound } from "next/navigation";
import { modulePages } from "@/modules/pages";
import { shellTab } from "../../shell";

type Params = { params: Promise<{ module: string; id: string }> };

/** A listing's own page in a module, as a job's page is on Jobs; a module without one is a 404. */
export default async function ModuleListingPage(p: Params) {
  const { Listing } = modulePages(await shellTab(p, "find"));
  if (!Listing) notFound();
  return <Listing id={decodeURIComponent((await p.params).id)} />;
}
