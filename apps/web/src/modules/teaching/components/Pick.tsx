"use client";
import { Chip } from "@/components/common/Input";

/** Choose any of a fixed list (grades, boards, qualifications): one chip per option. */
export function Pick({ label, options, value, onChange }: { label: string; options: readonly string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-1.5 text-[13px] font-medium text-ink-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip key={o} active={value.includes(o)} onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])}>
            {o}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** "Maths, Physics" ↔ ["Maths", "Physics"]. */
export const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
