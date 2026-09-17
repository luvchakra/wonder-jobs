import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("wj-skeleton h-4 w-full", className)} aria-hidden />;
}

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: string; action?: { label: string; href?: string; onClick?: () => void }; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-[20px] border border-dashed border-line-strong px-6 py-12 text-center", className)}>
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon ?? <Inbox className="size-5" aria-hidden />}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-3">{body}</p>}
      {action && (
        <Button className="mt-5" size="sm" href={action.href} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({ title, body, actions, className }: { title: string; body?: string; actions?: { label: string; onClick?: () => void; href?: string; variant?: "primary" | "outline" | "ghost" }[]; className?: string }) {
  return (
    <div role="alert" className={cn("rounded-[20px] border border-danger-600/20 bg-danger-100/50 p-5", className)}>
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {body && <p className="mt-1 text-sm text-ink-2">{body}</p>}
          {actions?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button key={a.label} size="sm" variant={a.variant ?? "outline"} onClick={a.onClick} href={a.href}>
                  {a.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PageLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}
