"use client";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Chip } from "@/components/common/Input";
import { MODULES, MODULE_IDS, type ModuleId } from "@/modules/registry";

const REMEMBER = "wj.admin.module";
const valid = (v: string | null): v is ModuleId => !!v && (MODULE_IDS as readonly string[]).includes(v);

/**
 * Which module an admin Listings page shows (owner, 2026-11-02: "make it applicable to all modules"). Each module has
 * its own WorksLake pool, so Browse, Quality, Source insights and Try a search read the one chosen here. It lives in the
 * URL (`?module=`), so a link or a reload keeps it; with none, the module last chosen on any of these pages (this
 * browser), else Jobs. Pages that call this sit inside a <Suspense> (Next needs one around useSearchParams).
 */
export function useAdminModule(): { module: ModuleId; label: string; setModule: (m: ModuleId) => void } {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get("module");
  const id: ModuleId = valid(asked) ? asked : "jobs";
  // No module in the URL: open on the one chosen last, so moving between Listings pages keeps it.
  useEffect(() => {
    if (valid(asked)) return;
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(REMEMBER);
    } catch {
      last = null;
    }
    if (valid(last) && last !== "jobs") router.replace(`${pathname}?module=${last}`);
  }, [asked, pathname, router]);
  return {
    module: id,
    label: MODULES.find((m) => m.id === id)?.label ?? "Jobs",
    setModule: (m) => {
      try {
        window.localStorage.setItem(REMEMBER, m);
      } catch {
        // Not remembered in a private window; the URL still holds it.
      }
      router.replace(`${pathname}?module=${m}`);
    },
  };
}

/** Every module as a chip, the chosen one marked: a row under the page title, scrolling sideways on a phone. */
export function ModulePicker({ value, onChange }: { value: ModuleId; onChange: (m: ModuleId) => void }) {
  return (
    <div role="group" aria-label="Module" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
      {MODULES.map((m) => (
        <Chip key={m.id} active={m.id === value} onClick={() => onChange(m.id)} className="shrink-0">
          {m.label}
        </Chip>
      ))}
    </div>
  );
}
