"use client";
import type { CareerRole } from "@/domain/career/roles";
import { cn } from "@/lib/cn";

/**
 * "Search as": the candidate's whole profile, or one of their roles. Renders nothing when they have no
 * roles, so searching works exactly as it did before roles existed.
 */
export function RolePicker({ roles, value, onChange, tone = "light" }: { roles: CareerRole[]; value: string | null; onChange: (roleId: string | null) => void; tone?: "light" | "dark" }) {
  if (!roles.length) return null;
  const options: { id: string | null; label: string }[] = [{ id: null, label: "My Career Profile" }, ...roles.map((r) => ({ id: r.id, label: r.title }))];
  return (
    <div>
      <p id="role-picker" className={cn("mb-1.5 text-[13px] font-medium", tone === "dark" ? "text-white/80" : "text-ink-2")}>
        Search as
      </p>
      <div role="radiogroup" aria-labelledby="role-picker" className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value === o.id;
          return (
            <button key={o.id ?? "profile"} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)} className={cn("rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors", on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
