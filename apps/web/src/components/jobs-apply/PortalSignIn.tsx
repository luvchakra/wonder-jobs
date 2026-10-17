"use client";
import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Fold } from "@/components/common/Fold";
import { Field, Input } from "@/components/common/Input";
import type { PortalConnection } from "@/domain/connections/types";

export type SignInBody = { mode: "sign_in" } | { mode: "create" } | { mode: "save"; email: string; password: string };
export type SignInOutcome = { result: "signed_in" | "needs_verification" | "failed" | "no_form"; message?: string };

/**
 * The employer's portal wants an account (WJ-316). Wonder signs in with the candidate's saved connection, creates
 * the account for them (their email, a password Wonder generates and keeps), or uses a sign-in they already have.
 * Nothing happens until they press one of these.
 */
export function PortalSignIn({ company, host, email, connection, busy, outcome, onSignIn }: { company: string; host: string; email?: string; connection?: PortalConnection; busy: boolean; outcome: SignInOutcome | null; onSignIn: (b: SignInBody) => void }) {
  const [own, setOwn] = useState({ email: email ?? "", password: "" });
  const verify = outcome?.result === "needs_verification" || connection?.status === "needs_verification";

  return (
    <div className="flex flex-col gap-2 rounded-[12px] bg-surface-2 px-3 py-3 text-[13px] text-ink-2">
      {verify ? (
        <>
          <p>
            {company} sent a verification email to {connection?.email ?? email}. Open it, then press Continue.
          </p>
          <Button size="sm" className="self-start" loading={busy} onClick={() => onSignIn({ mode: "sign_in" })}>
            Continue
          </Button>
        </>
      ) : connection ? (
        <>
          <p>{company}&apos;s site wants you to sign in. Wonder has your sign-in for {host}.</p>
          <Button size="sm" className="self-start" loading={busy} onClick={() => onSignIn({ mode: "sign_in" })}>
            Sign in as {connection.email}
          </Button>
        </>
      ) : (
        <>
          <p>{company}&apos;s site wants an account to apply.</p>
          {email && (
            <>
              <Button size="sm" className="self-start" loading={busy} onClick={() => onSignIn({ mode: "create" })}>
                Create an account for me
              </Button>
              <p className="text-[12px] text-ink-3">With {email} and a strong password Wonder keeps in Sign-in connections. Creating it accepts {company}&apos;s terms.</p>
            </>
          )}
        </>
      )}
      {outcome && outcome.result !== "signed_in" && outcome.result !== "needs_verification" && (
        <p role="alert" className="text-danger-600">
          {outcome.message ?? "That didn't sign in."}
        </p>
      )}
      {!verify && (
        <Fold title={connection ? "Use a different account" : "I already have an account"}>
          <div className="flex flex-col gap-2">
            <Field label="Email" htmlFor="ps-email">
              <Input id="ps-email" type="email" value={own.email} onChange={(e) => setOwn({ ...own, email: e.target.value })} autoComplete="off" />
            </Field>
            <Field label={`${company} password`} htmlFor="ps-pw" hint="Saved encrypted in Sign-in connections.">
              <Input id="ps-pw" type="password" value={own.password} onChange={(e) => setOwn({ ...own, password: e.target.value })} autoComplete="current-password" />
            </Field>
            <Button size="sm" variant="outline" className="self-start" loading={busy} disabled={!own.email || own.password.length < 6} onClick={() => onSignIn({ mode: "save", ...own })}>
              Sign in
            </Button>
          </div>
        </Fold>
      )}
    </div>
  );
}
