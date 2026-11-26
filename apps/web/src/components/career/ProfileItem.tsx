"use client";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { profileAnchor } from "./profiles";

/**
 * One profile in Career Profile's list: its name and one line, opening in place (the list keeps one open).
 * `action`: one small control right beside the name (My profile's rename pencil), above the row's own tap target.
 * `editor`: shown in the header's place while renaming.
 */
export function ProfileItem({ id, title, hint, open, onToggle, last, action, editor, children }: { id: string; title: string; hint?: string; open: boolean; onToggle: () => void; last?: boolean; action?: React.ReactNode; editor?: React.ReactNode; children: React.ReactNode }) {
  const body = `${profileAnchor(id)}-body`;
  return (
    <section id={profileAnchor(id)} className={cn("scroll-mt-32", !last && "border-b border-line")}>
      {editor ? (
        <div className="px-4 py-3">{editor}</div>
      ) : (
        <h2 className="relative flex items-center gap-3 px-4 py-3">
          <button type="button" aria-expanded={open} aria-controls={body} onClick={onToggle} aria-label={hint ? `${title}, ${hint}` : title} className="absolute inset-0 w-full text-left" />
          <span className="pointer-events-none min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span className="truncate text-[14.5px] font-semibold text-ink">{title}</span>
              {action && <span className="pointer-events-auto relative z-10 shrink-0">{action}</span>}
            </span>
            {hint && <span className="block truncate text-[12px] text-ink-3">{hint}</span>}
          </span>
          <ChevronDown className={cn("pointer-events-none size-4 shrink-0 text-ink-4 transition-transform", open && "rotate-180")} aria-hidden />
        </h2>
      )}
      <div id={body} hidden={!open} className="px-4 pb-4">
        {children}
      </div>
    </section>
  );
}
