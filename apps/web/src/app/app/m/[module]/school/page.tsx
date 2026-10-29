import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TeachingSchool } from "@/modules/teaching/components/School";
import { shellModule, type ShellParams } from "../shell";

/** Teaching → School: a hiring workspace's teaching roles, applications and demo classes (the owner side, WJ-420). */
export default async function ModuleSchoolPage(p: ShellParams) {
  const m = await shellModule(p);
  if (m.id !== "teaching") notFound();
  return (
    <Suspense>
      <TeachingSchool />
    </Suspense>
  );
}
