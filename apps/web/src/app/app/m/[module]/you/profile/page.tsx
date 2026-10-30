import { notFound } from "next/navigation";
import { modulePages } from "@/modules/pages";
import { shellTab, type ShellParams } from "../../shell";

/** A module's persona details (You → its rows). */
export default async function ModuleProfilePage(p: ShellParams) {
  const { Profile } = modulePages(await shellTab(p, "you"));
  if (!Profile) notFound();
  return <Profile />;
}
