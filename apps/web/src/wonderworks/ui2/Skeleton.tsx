import { cn } from "@/lib/cn";

/**
 * Loading in the second UI: grey blocks in the shape of what is coming, with a shimmer (no spinner). `Skeleton` is one
 * block; `SkeletonCard` and `SkeletonRail` are the shapes the rails and grids use. Decorative: the region that holds
 * them says it is loading (`role="status"` on `SkeletonRegion`).
 */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("wj-skeleton block", className)} />;
}

export function SkeletonRegion({ label = "Loading", className, children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}

/** An info card's shape: logo, two title lines, a meta line and a footer. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col gap-3 rounded-[12px] border border-line bg-surface p-4", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  );
}

/** A rail of cards still loading: the same widths as `CardRail`, so nothing moves when the cards arrive. */
export function SkeletonRail({ count = 3 }: { count?: number }) {
  return (
    <SkeletonRegion className="flex gap-3 overflow-hidden px-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} className="w-[78%] shrink-0 sm:w-[300px]" />
      ))}
    </SkeletonRegion>
  );
}
