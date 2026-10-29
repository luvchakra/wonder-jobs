import { ShellSaved } from "@/modules/savedCards";
import { shellTab, type ShellParams } from "../shell";

export default async function ModuleSavedPage(p: ShellParams) {
  const id = await shellTab(p, "saved");
  return id && <ShellSaved id={id} />;
}
