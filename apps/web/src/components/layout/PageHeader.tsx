import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, description, actions, back, eyebrow, className }: { title: string; description?: string; actions?: React.ReactNode; back?: { href: string; label?: string }; eyebrow?: string; className?: string }) {
  return (
    <div className={cn("mb-5 flex flex-col gap-3 md:mb-6 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> {back.label ?? "Back"}
          </Link>
        )}
        {eyebrow && <p className="wj-eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-[26px] font-semibold tracking-tight text-ink md:text-[30px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ title, action, className }: { title: string; action?: { label: string; href: string }; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between", className)}>
      <h2 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h2>
      {action && (
        <Link href={action.href} className="text-[13px] font-medium text-brand-600 hover:underline">
          {action.label} ›
        </Link>
      )}
    </div>
  );
}
