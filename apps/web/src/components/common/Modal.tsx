"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./Button";

/**
 * On a phone the on-screen keyboard covers the bottom of the layout viewport without resizing it, so a
 * bottom sheet's text field ends up behind it. While the dialog is open, keep it inside the *visible*
 * viewport: lift it by the keyboard's height and cap its height to the space that's left.
 */
function useKeyboardSafe(ref: React.RefObject<HTMLDialogElement | null>, open: boolean, placement: "sheet" | "top") {
  useEffect(() => {
    const el = ref.current;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!el || !open || !vv) return;
    const fit = () => {
      if (window.matchMedia("(min-width: 640px)").matches) {
        el.style.removeProperty("bottom");
        el.style.removeProperty("top");
        el.style.removeProperty("max-height");
        return;
      }
      const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (placement === "sheet") el.style.bottom = `${hidden}px`;
      else el.style.top = `${vv.offsetTop}px`;
      el.style.maxHeight = `${Math.round(vv.height - (placement === "sheet" ? 12 : 0))}px`;
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
      el.style.removeProperty("bottom");
      el.style.removeProperty("top");
      el.style.removeProperty("max-height");
    };
  }, [ref, open, placement]);
}

/**
 * Accessible dialog: focus trap via <dialog>, Escape closes, sheet on mobile (kept above the keyboard).
 * `placement="top"` drops it from the top on phones instead — for a search box, which belongs where the
 * keyboard can never reach it.
 * `dismissible={false}` is for a decision the candidate must make (no close button, Escape and
 * backdrop clicks do nothing) — the footer must then offer every way out.
 */
export function Modal({ open, onClose, title, description, children, footer, size = "md", dismissible = true, placement = "sheet" }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg"; dismissible?: boolean; placement?: "sheet" | "top" }) {
  const ref = useRef<HTMLDialogElement>(null);
  useKeyboardSafe(ref, open, placement);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (dismissible) onClose();
    };
    // Chrome closes a dialog on a repeated Escape even when `cancel` is prevented; a decision the
    // candidate must make re-opens itself.
    const onClosed = () => {
      if (!dismissible && open && !el.open) el.showModal();
    };
    el.addEventListener("cancel", onCancel);
    el.addEventListener("close", onClosed);
    return () => {
      el.removeEventListener("cancel", onCancel);
      el.removeEventListener("close", onClosed);
    };
  }, [onClose, dismissible, open]);
  const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };
  return (
    <dialog
      ref={ref}
      aria-labelledby="wj-modal-title"
      className={cn(
        "m-0 w-full max-w-full max-h-[92dvh] overflow-y-auto border-0 bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/40 backdrop:backdrop-blur-sm",
        placement === "top" ? "fixed inset-x-0 top-0 bottom-auto rounded-b-[24px] sm:inset-0 sm:m-auto sm:h-fit sm:rounded-[24px]" : "fixed inset-x-0 bottom-0 top-auto rounded-t-[24px] sm:inset-0 sm:m-auto sm:h-fit sm:rounded-[24px]",
        widths[size],
      )}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
    >
      <div className={placement === "top" ? "p-4 pt-[max(1rem,env(safe-area-inset-top))] sm:p-6" : "p-6"}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="wj-modal-title" className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
          </div>
          {dismissible && (
            <IconButton label="Close" onClick={onClose} size="sm">
              <X className="size-4" aria-hidden />
            </IconButton>
          )}
        </div>
        <div className="mt-5">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </dialog>
  );
}
