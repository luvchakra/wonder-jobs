"use client";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, ClipboardList, Download, Info, MousePointerClick, PanelsTopLeft, XCircle } from "lucide-react";
import type { Readiness } from "@/domain/jobs-apply/readiness";
import type { ApplyDestination } from "@/domain/jobs-apply/types";
import { PROVIDER_NAME } from "@/domain/jobs-apply/destination";
import type { FillDecision } from "@/domain/jobs-apply/policy";
import type { SavedResume } from "@/domain/resume/saved";
import { getTemplate } from "@/domain/resume/templates";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { cn } from "@/lib/cn";

export type Method = "helper" | "guided" | "pack";
export type ResumeOption = { key: string; label: string; detail: string; kind: "tailored" | "saved"; saved?: SavedResume };

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
  independent: boolean;
  onIndependent: (v: boolean) => void;
  fillPolicy: FillDecision;
  handoffPolicy: FillDecision;
  helperInstalled: boolean | null;
  busy: boolean;
  blockedReason?: string;
  onStart: () => void;
}) {
  const { readiness, destination } = props;
  const blocked = !readiness.ok || !destination || props.handoffPolicy === "skip" || !!props.blockedReason;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card aria-labelledby="wj-apply-method">
          <h2 id="wj-apply-method" className="text-[18px] font-semibold text-ink">
            How would you like to apply?
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">Whichever you choose, you submit on {props.company}&apos;s own site — Wonder never submits for you.</p>
          <div role="radiogroup" aria-label="Application method" className="mt-4 grid gap-3 sm:grid-cols-3">
            {METHODS.map((m) => {
              const selected = props.method === m.key;
              const recommended = m.key === "helper" ? props.helperInstalled === true : m.key === "guided" && props.helperInstalled === false;
              const disabled = m.key === "helper" && props.fillPolicy === "skip";
              return (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  onClick={() => props.onMethod(m.key)}
                  className={cn("relative flex min-w-0 flex-col gap-2 rounded-[16px] border p-4 text-left transition-colors", selected ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-200" : "border-line bg-surface hover:border-line-strong", disabled && "cursor-not-allowed opacity-60")}
                >
                  <span className="flex h-6 items-center justify-between">
                    <span className="text-brand-600">{m.icon}</span>
                    {recommended && <Badge tone="brand">Recommended</Badge>}
                  </span>
                  <span className="text-[14px] font-semibold text-ink">{m.title}</span>
                  <span className="text-[12px] text-ink-3">{m.body}</span>
                  <ul className="mt-1 flex flex-col gap-1">
                    {m.points.map((p) => (
                      <li key={p} className="flex items-start gap-1.5 text-[12px] text-ink-2">
                        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden /> {p}
                      </li>
                    ))}
                  </ul>
                  {m.key === "helper" && props.helperInstalled === false && <span className="mt-1 text-[12px] font-medium text-warning-600">Needs the WonderJobs browser helper</span>}
                  {disabled && <span className="mt-1 text-[12px] font-medium text-ink-3">“Fill application forms” is off in What Wonder can do</span>}
                  <span className={cn("absolute bottom-3 right-3", selected ? "text-brand-600" : "text-ink-4")}>{selected ? <CheckCircle2 className="size-5" aria-hidden /> : <Circle className="size-5" aria-hidden />}</span>
                </button>
              );
            })}
          </div>

          {props.method === "helper" && (
            <fieldset className="mt-4 rounded-[14px] bg-surface-2 p-3">
              <legend className="sr-only">How much should Wonder do?</legend>
              <p className="text-[13px] font-medium text-ink">How much should Wonder do?</p>
              <label className="mt-2 flex items-start gap-2 text-[13px] text-ink-2">
                <input type="radio" name="wj-independent" checked={!props.independent} onChange={() => props.onIndependent(false)} className="mt-1" />
                <span>
                  <strong className="font-medium text-ink">Fill forms for me</strong> — Wonder shows what it found and fills when you click Fill.
                </span>
              </label>
              <label className="mt-1 flex items-start gap-2 text-[13px] text-ink-2">
                <input type="radio" name="wj-independent" checked={props.independent} onChange={() => props.onIndependent(true)} className="mt-1" />
                <span>
                  <strong className="font-medium text-ink">Work more independently</strong> — fill safe fields as soon as the form opens.
                </span>
              </label>
              {props.independent && props.fillPolicy !== "run" && (
                <p className="mt-2 text-[12px] text-ink-3">
                  Your <Link href="/app/automation" className="font-medium text-brand-600 hover:underline">What Wonder can do</Link> setting for “Fill application forms” is “Ask”, so Wonder will still wait for your click.
                </p>
              )}
              {props.helperInstalled === false && (
                <p className="mt-2 text-[12px] text-ink-2">
                  <Link href="/extension" className="font-medium text-brand-600 hover:underline">Install the browser helper</Link> for the fastest experience — or choose Guide me; nothing is blocked either way.
                </p>
              )}
            </fieldset>
          )}

          {destination && (
            <div className="mt-4 flex items-start gap-3 rounded-[14px] border border-brand-100 bg-brand-50/50 p-3 text-[13px] text-ink-2">
              <ClipboardList className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
              <p className="min-w-0">
                Application destination: <strong className="break-all font-medium text-ink">{destination.domain}</strong>
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
              </p>
            </div>
          )}
        </Card>

        <Card aria-labelledby="wj-apply-docs">
          <h2 id="wj-apply-docs" className="text-[16px] font-semibold text-ink">
            Documents
          </h2>
          <p className="mt-1 text-[13px] font-medium text-ink-2">Résumé</p>
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
              No résumé yet. <Link href={props.prepareHref} className="font-medium text-brand-600 hover:underline">Prepare one in the Application Pack</Link> or <Link href="/app/resume-studio" className="font-medium text-brand-600 hover:underline">generate one from a template</Link>.
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
              Optional — none prepared. <Link href={props.prepareHref} className="font-medium text-brand-600 hover:underline">Draft one</Link> if you&apos;d like to include it.
            </p>
          )}
        </Card>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
        <Card aria-labelledby="wj-apply-ready">
          <h2 id="wj-apply-ready" className="text-[16px] font-semibold text-ink">
            {readiness.ok ? "Ready to apply" : "Before applying"}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
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
          {props.handoffPolicy === "skip" && <p className="mt-3 text-[12px] text-danger-600">“Hand off application” is turned off in What Wonder can do, so Wonder won&apos;t open employer pages for you.</p>}
          {!destination && <p className="mt-3 text-[12px] text-danger-600">This job has no application link Wonder can open.</p>}
          {props.blockedReason && <p className="mt-3 text-[12px] text-warning-600">{props.blockedReason}</p>}
          <Button full size="lg" className="mt-4" onClick={props.onStart} disabled={blocked || props.busy} loading={props.busy}>
            {props.method === "pack" ? "Download Application Pack" : "Start application"}
          </Button>
          <p className="mt-2 text-center text-[11px] text-ink-4">Wonder fills. You review and submit.</p>
        </Card>
      </aside>
    </div>
  );
}

export function resumeOptionsFor(input: { jobId: string; hasTailored: boolean; tailoredSource?: string; saved: SavedResume[] }): ResumeOption[] {
  const out: ResumeOption[] = [];
  const forJob = input.saved.filter((s) => s.target?.jobId === input.jobId);
  const others = input.saved.filter((s) => s.target?.jobId !== input.jobId).slice(0, 4);
  for (const s of [...forJob, ...others]) {
    const t = getTemplate(s.templateId);
    out.push({ key: `saved:${s.id}`, kind: "saved", saved: s, label: `${t?.name ?? s.templateId} template résumé (PDF)`, detail: `${s.target?.jobId === input.jobId ? "Made for this role · " : ""}From your Career Profile · ${new Date(s.createdAt).toLocaleDateString()} · template v${s.templateVersion}` });
  }
  if (input.hasTailored) out.push({ key: "tailored", kind: "tailored", label: "Tailored résumé for this role (DOCX)", detail: input.tailoredSource ? `From the Application Pack · ${input.tailoredSource}` : "From the Application Pack" });
  return out;
}
