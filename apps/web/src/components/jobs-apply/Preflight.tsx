"use client";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, ClipboardList, Download, Info, MousePointerClick, PanelsTopLeft, XCircle } from "lucide-react";
import type { Readiness } from "@/domain/jobs-apply/readiness";
import type { ApplyDestination } from "@/domain/jobs-apply/types";
import { PROVIDER_NAME } from "@/domain/jobs-apply/destination";
import type { FillDecision } from "@/domain/jobs-apply/policy";
import type { ResumeOption } from "@/domain/jobs-apply/resumeOptions";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Fold } from "@/components/common/Fold";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type Method = "helper" | "guided" | "pack";

/** Short names for the one-line summary and the Automation choice. */
export const METHOD_LABEL: Record<Method, string> = { helper: "Fill it in with the browser helper", guided: "Guide me", pack: "Application Pack only" };
export { resumeOptionsFor, type ResumeOption } from "@/domain/jobs-apply/resumeOptions";

const METHODS: { key: Method; title: string; body: string; points: string[]; icon: React.ReactNode }[] = [
  {
    key: "helper",
    title: "Fill it in with the browser helper",
    body: "Wonder opens the employer's form in your browser and fills your details and résumé.",
    points: ["Stops for questions only you should answer", "Never needs your portal password", "You review and submit"],
    icon: <MousePointerClick className="size-5" aria-hidden />,
  },
  {
    key: "guided",
    title: "Guide me",
    body: "Open the form yourself; every value, answer and document is ready to copy here.",
    points: ["Works on any application form", "Copy buttons for each field", "You fill and submit"],
    icon: <PanelsTopLeft className="size-5" aria-hidden />,
  },
  {
    key: "pack",
    title: "Application Pack only",
    body: "Download your résumé, cover letter and answers to apply at your own pace.",
    points: ["One zip with everything", "Includes the application link", "Mark it submitted when done"],
    icon: <Download className="size-5" aria-hidden />,
  },
];

const ICON = {
  ok: <CheckCircle2 className="size-4 text-success-600" aria-hidden />,
  warn: <AlertTriangle className="size-4 text-warning-600" aria-hidden />,
  info: <Info className="size-4 text-info-600" aria-hidden />,
  blocker: <XCircle className="size-4 text-danger-600" aria-hidden />,
};

export function Preflight(props: {
  company: string;
  prepareHref: string;
  readiness: Readiness;
  destination: ApplyDestination | null;
  adapterName?: string;
  resumeOptions: ResumeOption[];
  resumeKey: string;
  onResume: (key: string) => void;
  hasCover: boolean;
  includeCover: boolean;
  onIncludeCover: (v: boolean) => void;
  method: Method;
  onMethod: (m: Method) => void;
  fillPolicy: FillDecision;
  handoffPolicy: FillDecision;
  helperInstalled: boolean | null;
  /** A desktop browser: the only place the form is filled for you (with the extension). Phones and tablets get Guide me and the Pack. */
  desktop: boolean;
  busy: boolean;
  blockedReason?: string;
  onStart: () => void;
}) {
  const { readiness, destination } = props;
  const [showMethods, setShowMethods] = useState(false);
  // Arriving here ("Apply with Wonder" and every other way in), the next step is Start: bring it into view
  // when it's below the fold — on a phone it sits under the title and the steps.
  const startRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = startRef.current;
    if (el && el.getBoundingClientRect().bottom > window.innerHeight) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);
  const blocked = !readiness.ok || !destination || props.handoffPolicy === "skip" || !!props.blockedReason;
  const chosen = props.resumeOptions.find((o) => o.key === props.resumeKey);
  const readyCount = readiness.items.filter((i) => i.state === "ok").length;
  const toDo = readiness.items.filter((i) => i.state === "warn" || i.state === "blocker").length;
  // One card with the choice that matters and Start; documents, the checklist and where the form lives are folded below.
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <Card aria-labelledby="wj-apply-method">
        <h2 id="wj-apply-method" className="mb-2 text-[15px] font-semibold text-ink">
          How would you like to apply?
        </h2>
        {/* Set once in Automation; changed here only for this job. */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-2">
          <CheckCircle2 className="size-4 shrink-0 text-brand-600" aria-hidden />
          <strong className="font-medium text-ink">{METHOD_LABEL[props.method]}</strong>
          <span className="text-[13px] text-ink-3">
            — your default in{" "}
            <Link href="/app/automation/settings" className="text-brand-600 hover:underline">
              Automation
            </Link>
          </span>
          {!showMethods && (
            <button type="button" className="text-[13px] font-medium text-brand-600 hover:underline" onClick={() => setShowMethods(true)}>
              Change for this job
            </button>
          )}
        </p>
        {showMethods && (
          <div role="radiogroup" aria-label="Application method" className="mt-3 flex flex-col gap-2">
            {METHODS.filter((m) => props.desktop || m.key !== "helper").map((m) => {
              const selected = props.method === m.key;
              const recommended = m.key === "helper" ? props.helperInstalled === true : m.key === "guided" && (!props.desktop || props.helperInstalled === false);
              const disabled = m.key === "helper" && props.fillPolicy === "skip";
              return (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => props.onMethod(m.key)}
                  className={cn("flex min-w-0 items-start gap-3 rounded-[12px] border p-3 text-left transition-colors", selected ? "border-brand-500 bg-brand-50/60" : "border-line bg-surface hover:border-line-strong", disabled && "cursor-not-allowed opacity-60")}
                >
                  <span className={cn("mt-0.5", selected ? "text-brand-600" : "text-ink-4")}>{selected ? <CheckCircle2 className="size-5" aria-hidden /> : <Circle className="size-5" aria-hidden />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                      {m.title} {recommended && <Badge tone="brand">Recommended</Badge>}
                    </span>
                    <span className="block text-[12px] text-ink-3">{m.body}</span>
                    {m.key === "helper" && props.helperInstalled === false && <span className="mt-1 block text-[12px] font-medium text-warning-600">Needs the WonderJobs browser helper</span>}
                    {disabled && <span className="mt-1 block text-[12px] font-medium text-ink-3">“Fill application forms” is off in Automation</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {props.method === "helper" && props.helperInstalled === false && (
          <p className="mt-2 text-[12px] text-ink-2">
            <Link href="/extension" className="font-medium text-brand-600 hover:underline">
              Install the browser helper
            </Link>{" "}
            — or choose Guide me; nothing is blocked either way.
          </p>
        )}
        <p className="mt-2 truncate text-[13px] text-ink-3">
          Résumé: <span className="text-ink-2">{chosen?.label ?? "none yet"}</span>
          {props.hasCover && props.includeCover ? " · with cover letter" : ""}
        </p>
        {props.handoffPolicy === "skip" && <p className="mt-2 text-[12px] text-danger-600">“Hand off application” is turned off in Automation, so Wonder won&apos;t open employer pages for you.</p>}
        {!destination && <p className="mt-2 text-[12px] text-danger-600">This job has no application link Wonder can open.</p>}
        {props.blockedReason && <p className="mt-2 text-[12px] text-warning-600">{props.blockedReason}</p>}
        {!readiness.ok &&
          readiness.items
            .filter((i) => i.state === "blocker")
            .map((i) => (
              <p key={i.key} className="mt-2 flex items-start gap-2 text-[12px] text-danger-600">
                <span className="mt-0.5">{ICON.blocker}</span> {i.label}
                {i.detail ? ` — ${i.detail}` : ""}
              </p>
            ))}
        <div ref={startRef}>
          <Button full size="lg" className="mt-3" onClick={props.onStart} disabled={blocked || props.busy} loading={props.busy}>
            {props.method === "pack" ? "Download Application Pack" : "Start application"}
          </Button>
          <p className="mt-2 text-center text-[11px] text-ink-4">Wonder fills. You review and submit.</p>
        </div>
      </Card>

      <Fold title="Documents" hint={`${chosen ? chosen.label : "No résumé yet"}${props.hasCover ? (props.includeCover ? " · cover letter" : " · no cover letter") : ""}`}>
        <p className="text-[13px] font-medium text-ink-2">Résumé</p>
        {props.resumeOptions.length ? (
          <div role="radiogroup" aria-label="Résumé to use" className="mt-2 flex flex-col gap-2">
            {props.resumeOptions.map((o) => (
              <label key={o.key} className={cn("flex cursor-pointer items-start gap-3 rounded-[12px] border p-3", props.resumeKey === o.key ? "border-brand-400 bg-brand-50/40" : "border-line")}>
                <input type="radio" name="wj-resume" checked={props.resumeKey === o.key} onChange={() => props.onResume(o.key)} className="mt-1" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink">{o.label}</span>
                  <span className="block text-[12px] text-ink-3">{o.detail}</span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[13px] text-ink-3">
            No résumé yet.{" "}
            <Link href="/app/resume-studio" className="font-medium text-brand-600 hover:underline">
              Upload the résumé you already use
            </Link>
            ,{" "}
            <Link href={props.prepareHref} className="font-medium text-brand-600 hover:underline">
              prepare one in the Application Pack
            </Link>{" "}
            or{" "}
            <Link href="/app/resume-studio?tab=templates" className="font-medium text-brand-600 hover:underline">
              generate one from a template
            </Link>
            .
          </p>
        )}
        <p className="mt-4 text-[13px] font-medium text-ink-2">Cover letter</p>
        {props.hasCover ? (
          <label className="mt-1 flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={props.includeCover} onChange={(e) => props.onIncludeCover(e.target.checked)} />
            Include my cover letter when the form asks for one
          </label>
        ) : (
          <p className="mt-1 text-[13px] text-ink-3">
            Optional — none prepared.{" "}
            <Link href={props.prepareHref} className="font-medium text-brand-600 hover:underline">
              Draft one
            </Link>{" "}
            if you&apos;d like to include it.
          </p>
        )}
      </Fold>

      <Fold title={readiness.ok ? "Ready to apply" : "Before applying"} hint={toDo ? `${toDo} to check` : `${readyCount} of ${readiness.items.length} ready`} open={!readiness.ok}>
        <ul className="flex flex-col gap-2" aria-labelledby="wj-apply-ready">
          {readiness.items.map((i) => (
            <li key={i.key} className="flex items-start gap-2 text-[13px]">
              <span className="mt-0.5">{ICON[i.state]}</span>
              <span className="min-w-0">
                <span className="text-ink">{i.label}</span>
                {i.detail && <span className="block text-[12px] text-ink-3">{i.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Fold>

      {destination && (
        <Fold title="Where you'll apply" hint={destination.domain}>
          <p className="flex items-start gap-3 text-[13px] text-ink-2">
            <ClipboardList className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
            <span className="min-w-0">
              <strong className="break-all font-medium text-ink">{destination.domain}</strong>
              {destination.provider ? (
                <>
                  {" "}
                  — the apply link points to a {PROVIDER_NAME[destination.provider]} form.
                  {props.adapterName ? ` The helper has a ${props.adapterName} adapter` : " The helper reads it like any other form"}; it fills what it can identify with confidence and leaves the rest for you.
                </>
              ) : (
                " — the helper reads the form by its labels and fills what it can identify with confidence."
              )}
              {destination.type === "aggregator" && " This link is a job board, not the employer's own form; the board may send you on to the employer."}
              <span className="mt-1 block text-ink-3">You submit on {props.company}&apos;s own site — or Wonder&apos;s helper does, only if Submit for me is on.</span>
            </span>
          </p>
        </Fold>
      )}
    </div>
  );
}
