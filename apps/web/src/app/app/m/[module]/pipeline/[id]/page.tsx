import { notFound } from "next/navigation";
import { InternshipApplication } from "@/modules/internships/components/Application";
import { shellTab } from "../../shell";

type Params = { params: Promise<{ module: string; id: string }> };

/** One item in a module's Pipeline tab. Only Internships has an item page so far; any other module's is a 404. */
export default async function ModulePipelineItemPage(p: Params) {
  const id = await shellTab(p, "pipeline");
  if (id !== "internships") notFound();
  return <InternshipApplication id={decodeURIComponent((await p.params).id)} />;
}
