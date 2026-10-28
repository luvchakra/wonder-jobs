import { ModulePipeline } from "@/platform/shell/ModulePages";
import { shellTab, type ShellParams } from "../shell";

export default async function ModulePipelinePage(p: ShellParams) {
  const id = await shellTab(p, "pipeline");
  return id && <ModulePipeline id={id} />;
}
