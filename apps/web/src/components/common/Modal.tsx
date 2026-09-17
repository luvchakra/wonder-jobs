"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { IconButton } from "./Button";

/** Accessible dialog: focus trap via <dialog>, Escape closes, sheet on mobile. */
export function Modal({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const ref = useRef<HTMLDialogElement>(null);
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
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onClose]);
  const widths = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" };
  return (
    <dialog
      ref={ref}
      aria-labelledby="wj-modal-title"
      className={cn(
        "m-0 w-full max-h-[92dvh] overflow-y-auto border-0 bg-surface p-0 text-ink shadow-lg backdrop:bg-ink/40 backdrop:backdrop-blur-sm",
        "fixed inset-x-0 bottom-0 top-auto rounded-t-[24px] sm:inset-0 sm:m-auto sm:h-fit sm:rounded-[24px]",
        widths[size],
      )}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="wj-modal-title" className="text-lg font-semibold tracking-tight">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} size="sm">
            <X className="size-4" aria-hidden />
          </IconButton>
        </div>
        <div className="mt-5">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </dialog>
  );
}
