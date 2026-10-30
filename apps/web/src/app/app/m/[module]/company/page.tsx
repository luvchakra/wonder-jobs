import { Suspense } from "react";
import { notFound } from "next/navigation";
import { modulePages } from "@/modules/pages";
import { shellModule, type ShellParams } from "../shell";

/** A module's owner side: a company's (or school's) workspace, its listings and their responses. */
export default async function ModuleCompanyPage(p: ShellParams) {
  const m = await shellModule(p);
  const { Company } = modulePages(m.id === "jobs" ? null : m.id);
  if (!Company) notFound();
  return (
    <Suspense>
      <Company />
    </Suspense>
  );
}
