"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import type { ResumeLayout } from "@/domain/resume/layout";
import { IconButton } from "@/components/common/Button";
import { ResumePage } from "./ResumePage";

const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

/**
 * A résumé page viewer (spec §31, §72): page navigation and zoom. 100% fits the page to the width
 * available; zooming scales the page — it never reflows into a web page — and scrolls inside the
 * viewer, not the screen.
 */
export function ResumeViewer({ layout, title }: { layout: ResumeLayout; title: string }) {
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(1);
  const n = layout.pages.length;
  const current = Math.min(page, n - 1);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink">
          {title} <span className="font-normal text-ink-3">· Page {current + 1} of {n}</span>
        </p>
        <div className="flex items-center gap-1" role="group" aria-label="Page and zoom">
          <IconButton size="sm" label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </IconButton>
          <IconButton size="sm" label="Next page" disabled={current >= n - 1} onClick={() => setPage(current + 1)}>
            <ChevronRight className="size-4" aria-hidden />
          </IconButton>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <IconButton size="sm" label="Zoom out" disabled={zoom === ZOOMS[0]} onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}>
            <Minus className="size-4" aria-hidden />
          </IconButton>
          <span className="w-12 text-center text-[12px] tabular-nums text-ink-2" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton size="sm" label="Zoom in" disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])}>
            <Plus className="size-4" aria-hidden />
          </IconButton>
        </div>
      </div>
      <div className="max-h-[70dvh] overflow-auto rounded-[12px] bg-bg-soft p-2 sm:p-4" data-testid="resume-viewer">
        <div style={{ width: `${zoom * 100}%` }} className="mx-auto">
          <ResumePage layout={layout} page={layout.pages[current]} index={current} className="block w-full shadow-md" />
        </div>
      </div>
    </div>
  );
}
