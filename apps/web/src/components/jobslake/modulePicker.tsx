"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/common/Input";
import { MODULES, MODULE_IDS, type ModuleId } from "@/modules/registry";

/**
 * Which module an admin data page shows (owner, 2026-11-01: the admin caters to every module equally). Each module has
 * its own WorksLake pool, so Job listings, Data quality, Source insights and the Search playground read the one chosen
 * here. It lives in the URL (`?module=`), so a link or a reload keeps it; Jobs when none is given.
 * Pages that call this sit inside a <Suspense> (Next needs one around useSearchParams).
 */
export function useAdminModule(): {
  module: ModuleId;
  label: string;
  setModule: (m: ModuleId) => void;
} {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get("module") ?? "";
  const id = (
    (MODULE_IDS as readonly string[]).includes(asked) ? asked : "jobs"
  ) as ModuleId;
  return {
    module: id,
    label: MODULES.find((m) => m.id === id)?.label ?? "Jobs",
    setModule: (m) =>
      router.replace(m === "jobs" ? pathname : `${pathname}?module=${m}`),
  };
}

export function ModulePicker({
  value,
  onChange,
}: {
  value: ModuleId;
  onChange: (m: ModuleId) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as ModuleId)}
      aria-label="Module"
      className="h-9 w-auto min-w-[10rem] text-[13px]"
    >
      {MODULES.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </Select>
  );
}
