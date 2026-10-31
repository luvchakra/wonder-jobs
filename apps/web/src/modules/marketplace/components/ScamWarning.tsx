import { ShieldAlert } from "lucide-react";
import { PAYMENT_WARNING } from "../domain";

/** The one advance-payment warning, on every listing, conversation and offer: WonderWorks never holds money. */
export function ScamWarning({ className }: { className?: string }) {
  return (
    <p role="note" className={`flex items-start gap-2 rounded-[12px] bg-warning-50 px-3 py-2 text-[13px] text-ink-2 ${className ?? ""}`}>
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning-600" aria-hidden />
      <span>{PAYMENT_WARNING}</span>
    </p>
  );
}
