import { notFound } from "next/navigation";
import { InternshipPage } from "@/modules/internships/components/InternshipPage";
import { shellTab } from "../../shell";

type Params = { params: Promise<{ module: string; id: string }> };

/** A listing's own page in a module, as a job's page is on Jobs. Only Internships has one so far; any other module's is a 404. */
export default async function ModuleListingPage(p: Params) {
  const id = await shellTab(p, "find");
  if (id !== "internships") notFound();
  return <InternshipPage id={decodeURIComponent((await p.params).id)} />;
}
