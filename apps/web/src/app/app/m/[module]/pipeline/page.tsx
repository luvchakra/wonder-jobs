import { ModulePipeline } from "@/platform/shell/ModulePages";
import { InternshipsPipeline } from "@/modules/internships/components/Pipeline";
import { TeachingPipeline } from "@/modules/teaching/components/Pipeline";
import { shellTab, type ShellParams } from "../shell";

export default async function ModulePipelinePage(p: ShellParams) {
  const id = await shellTab(p, "pipeline");
  if (id === "internships") return <InternshipsPipeline />;
  if (id === "teaching") return <TeachingPipeline />;
  return id && <ModulePipeline id={id} />;
}
