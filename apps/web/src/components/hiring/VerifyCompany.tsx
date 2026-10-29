"use client";
import { useEffect, useState } from "react";
import { BadgeCheck, Mail, Search } from "lucide-react";
import type { Organization } from "@/domain/org/types";
import { hiringApi } from "@/services/hiring/client";
import { Button } from "@/components/common/Button";
import { Field, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";

type Options = Awaited<ReturnType<typeof hiringApi.verification>>;

/**
 * How an Owner verifies the company. Instantly, when their sign-in email is on the company website's domain;
 * otherwise by asking the WonderJobs team to review it. What each path needs is said up front, and the result
 * shown is what actually happened (verified, request sent, or not sent).
 */
export function VerifyCompany({ org, onClose, onVerified, onEditWorkspace }: { org: Organization; onClose: () => void; onVerified: () => void; onEditWorkspace: () => void }) {
  const [opts, setOpts] = useState<Options | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"email" | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState<boolean | null>(null);
  useEffect(() => {
    hiringApi
      .verification(org.id)
      .then(setOpts)
      .catch((e: Error) => setError(e.message));
  }, [org.id]);

  const byEmail = async () => {
    setBusy("email");
    setError(null);
    try {
      await hiringApi.verifyByEmail(org.id);
      toast.success(`${org.name} is verified`, "Your open jobs now show it to job seekers.");
      onVerified();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const review = async () => {
    setBusy("review");
    setError(null);
    try {
      setRequested((await hiringApi.requestReview(org.id, note)).sent);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="Verify your company" description="Verified companies' jobs don't carry the “not verified yet” note, so job seekers apply with confidence.">
      {!opts && !error && <p className="text-[13px] text-ink-3">Loading…</p>}
      {opts && !opts.websiteDomain ? (
        <div className="flex flex-col gap-3 text-[14px] text-ink-2">
          <p>First add your company&apos;s website: verification checks that the company is real and that you work there, against its website.</p>
          <Button className="self-start" onClick={onEditWorkspace}>
            Add the website
          </Button>
        </div>
      ) : opts ? (
        <div className="flex flex-col gap-4">
          <section className="rounded-[14px] border border-line p-4">
            <h3 className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink">
              <Mail className="size-4 text-brand-600" aria-hidden /> With your work email · instant
            </h3>
            {opts.workEmailMatches ? (
              <>
                <p className="mt-1 text-[13px] text-ink-2">
                  You&apos;re signed in as <b>{opts.email}</b>, on <b>{opts.websiteDomain}</b>, your company&apos;s website. That&apos;s enough to verify it now.
                </p>
                <Button className="mt-3" icon={<BadgeCheck className="size-4" aria-hidden />} onClick={byEmail} loading={busy === "email"} disabled={busy !== null}>
                  Verify now
                </Button>
              </>
            ) : (
              <p className="mt-1 text-[13px] text-ink-2">
                Needs a sign-in email on <b>{opts.websiteDomain}</b>. You&apos;re signed in as <b>{opts.email ?? "an account without an email"}</b>. Sign in to WonderStar with your work email (an Owner can invite it under Team), then come back here. Personal addresses like Gmail don&apos;t count.
              </p>
            )}
          </section>
          <section className="rounded-[14px] border border-line p-4">
            <h3 className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink">
              <Search className="size-4 text-brand-600" aria-hidden /> Ask WonderStar to review · about 2 business days
            </h3>
            {requested === true ? (
              <p role="status" className="mt-1 text-[13px] text-success-600">
                Request sent. The team checks {opts.websiteDomain}, the company&apos;s public registration and that you work there, and emails you when it&apos;s done.
              </p>
            ) : requested === false ? (
              <p role="alert" className="mt-1 text-[13px] text-danger-600">
                The request couldn&apos;t be sent. Email connect@wonderapps.biz with the company&apos;s name and website, and we&apos;ll review it from there.
              </p>
            ) : (
              <>
                <p className="mt-1 text-[13px] text-ink-2">The team checks {opts.websiteDomain}, the company&apos;s public registration and that you work there, and emails you when it&apos;s done.</p>
                <Field label="Anything that helps (optional)" htmlFor="vc-note" className="mt-3">
                  <Textarea id="vc-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Company registration number (CIN, GSTIN), LinkedIn page, your role" />
                </Field>
                <Button className="mt-3" variant="outline" onClick={review} loading={busy === "review"} disabled={busy !== null}>
                  Request review
                </Button>
              </>
            )}
          </section>
        </div>
      ) : null}
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger-600">
          {error}
        </p>
      )}
    </Modal>
  );
}
