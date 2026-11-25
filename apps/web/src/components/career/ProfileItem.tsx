"use client";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { profileAnchor } from "./profiles";

/** One profile in Career Profile's list: its name and one line, opening in place (the list keeps one open). */
export function ProfileItem({
  id,
  title,
  hint,
  open,
  onToggle,
  last,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  last?: boolean;
  children: React.ReactNode;
}) {
  const body = `${profileAnchor(id)}-body`;
  return (
    <section
      id={profileAnchor(id)}
      className={cn("scroll-mt-32", !last && "border-b border-line")}
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={onToggle}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold text-ink">
              {title}
            </span>
            {hint && (
              <span className="block truncate text-[12px] text-ink-3">
                {hint}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-ink-4 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </h2>
      <div id={body} hidden={!open} className="px-4 pb-4">
        {children}
      </div>
    </section>
  );
}
