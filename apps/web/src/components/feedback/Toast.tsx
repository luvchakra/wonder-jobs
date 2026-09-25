"use client";
import { create } from "zustand";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/ids";

interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: "success" | "info" | "warning" | "error";
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = newId("toast");
    set((s) => ({ toasts: [...s.toasts, { ...t, id }].slice(-4) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.tone === "error" ? 8000 : 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, body?: string, action?: Toast["action"]) => useToasts.getState().push({ title, body, tone: "success", action }),
  info: (title: string, body?: string, action?: Toast["action"]) => useToasts.getState().push({ title, body, tone: "info", action }),
  warning: (title: string, body?: string, action?: Toast["action"]) => useToasts.getState().push({ title, body, tone: "warning", action }),
  error: (title: string, body?: string, action?: Toast["action"]) => useToasts.getState().push({ title, body, tone: "error", action }),
};

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const icons = { success: <CheckCircle2 className="size-5 text-success-600" aria-hidden />, info: <Info className="size-5 text-info-600" aria-hidden />, warning: <AlertTriangle className="size-5 text-warning-600" aria-hidden />, error: <XCircle className="size-5 text-danger-600" aria-hidden /> };
  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--wj-mobile-nav-h)+1rem)] z-[60] flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:items-end">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={cn("pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[16px] border border-line bg-surface p-4 shadow-lg wj-animate-fade-up")}>
          {icons[t.tone]}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[13px] text-ink-3">{t.body}</p>}
            {t.action && (
              <button type="button" onClick={t.action.onClick} className="mt-2 text-[13px] font-semibold text-brand-600 hover:underline">
                {t.action.label}
              </button>
            )}
          </div>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="rounded-md p-1 text-ink-4 hover:bg-bg-soft hover:text-ink">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
