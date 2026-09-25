"use client";
import { AlertTriangle, CreditCard, KeyRound, Lock, PauseCircle, ShieldAlert } from "lucide-react";
import { FAILURE_COPY } from "@/domain/jobs-apply/states";
import type { PublicSession } from "@/services/jobs-apply/client";
import { Button } from "@/components/common/Button";

/**
 * Every pause or stop explains what happened, that nothing was submitted, and what the candidate
 * can do next (§33–§38, §72–§74, §99). Never "Error 500".
 */
export function StatusBanner({ session, onResume, onApproveDomain, onStop, onOpen, onGuided, busy }: { session: PublicSession; onResume: () => void; onApproveDomain: (host: string) => void; onStop: () => void; onOpen: () => void; onGuided: () => void; busy?: boolean }) {
  const f = session.failure;
  if (!f && session.status !== "AUTHENTICATION_REQUIRED") return null;
  const code = f ?? "AUTH_REQUIRED";
  const copy = FAILURE_COPY[code];
  const lastHost = [...session.audit].reverse().find((a) => a.event === "DOMAIN_CHANGED")?.where;
  const icon = code === "PAYMENT_REQUESTED" ? <CreditCard className="size-5" aria-hidden /> : code === "DOMAIN_CHANGED" ? <ShieldAlert className="size-5" aria-hidden /> : code === "AUTH_REQUIRED" ? <KeyRound className="size-5" aria-hidden /> : code === "MFA_REQUIRED" || code === "CAPTCHA_REQUIRED" ? <Lock className="size-5" aria-hidden /> : code === "USER_CANCELLED" ? <PauseCircle className="size-5" aria-hidden /> : <AlertTriangle className="size-5" aria-hidden />;
  const tone = code === "PAYMENT_REQUESTED" || code === "DOMAIN_CHANGED" ? "border-danger-100 bg-danger-100/40" : "border-warning-100 bg-warning-100/50";
  return (
    <div role="alert" className={`mb-4 rounded-[16px] border p-4 ${tone}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-ink-2">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">{copy.title}</p>
          <p className="mt-0.5 text-[13px] text-ink-2">{copy.body}</p>
          {code === "DOMAIN_CHANGED" && lastHost && (
            <p className="mt-2 break-all rounded-[10px] bg-surface px-3 py-2 font-mono text-[12px] text-ink">
              Wonder detected a new destination: https://{lastHost}
            </p>
          )}
          {code !== "USER_CANCELLED" && code !== "DOMAIN_CHANGED" && <p className="mt-1 text-[12px] font-medium text-ink-3">Nothing was submitted.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {code === "DOMAIN_CHANGED" && lastHost && (
              <>
                <Button size="sm" variant="outline" onClick={() => onApproveDomain(lastHost)} disabled={busy}>
                  Continue on {lastHost}
                </Button>
                <Button size="sm" variant="danger" onClick={onStop} disabled={busy}>
                  Stop
                </Button>
              </>
            )}
            {(code === "CAPTCHA_REQUIRED" || code === "MFA_REQUIRED") && (
              <Button size="sm" onClick={onResume} disabled={busy}>
                I&apos;ve completed it
              </Button>
            )}
            {code === "AUTH_REQUIRED" && (
              <Button size="sm" onClick={onOpen}>
                Open sign-in on the employer&apos;s site
              </Button>
            )}
            {code === "USER_CANCELLED" && (
              <Button size="sm" onClick={onResume} disabled={busy}>
                Continue application
              </Button>
            )}
            {code === "PAYMENT_REQUESTED" && (
              <Button size="sm" variant="outline" onClick={onStop} disabled={busy}>
                Stop this application
              </Button>
            )}
            {(code === "FORM_NOT_FOUND" || code === "ADAPTER_FAILURE" || code === "PORTAL_BLOCKED" || code === "AUTH_REQUIRED" || code === "PAYMENT_REQUESTED") && (
              <Button size="sm" variant="outline" onClick={onGuided}>
                Use guided mode
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
