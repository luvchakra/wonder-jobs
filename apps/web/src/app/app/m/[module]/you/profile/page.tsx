import { notFound } from "next/navigation";
import { InternshipsProfile } from "@/modules/internships/components/You";
import { shellTab, type ShellParams } from "../../shell";

/** A module's persona details (You → its rows): Internships' student details today. */
export default async function ModuleProfilePage(p: ShellParams) {
  const id = await shellTab(p, "you");
  if (id === "internships") return <InternshipsProfile />;
  notFound();
}
