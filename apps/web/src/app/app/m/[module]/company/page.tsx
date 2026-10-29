import { Suspense } from "react";
import { notFound } from "next/navigation";
import { InternshipsCompany } from "@/modules/internships/components/Company";
import { shellModule, type ShellParams } from "../shell";

/** Internships → Company: a hiring workspace's internships and their applications (the owner side, WJ-418). */
export default async function ModuleCompanyPage(p: ShellParams) {
  const m = await shellModule(p);
  if (m.id !== "internships") notFound();
  return (
    <Suspense>
      <InternshipsCompany />
    </Suspense>
  );
}
