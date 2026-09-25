"use client";
import { Copy, Download, ExternalLink, FileText, Package } from "lucide-react";
import { PROFILE_LABEL, PROVENANCE_LABEL } from "@/domain/jobs-apply/profile";
import type { ApplicationPackSnapshot } from "@/domain/jobs-apply/types";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { toast } from "@/components/feedback/Toast";

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy", "Select the text and copy it yourself.");
  }
}

const ORDER = ["firstName", "lastName", "fullName", "email", "phone", "location", "city", "country", "linkedinUrl", "portfolioUrl", "githubUrl", "websiteUrl", "currentEmployer", "currentTitle"] as const;

/**
 * §38, §93, §102 Guided mode: everything ready to copy or download while the candidate fills the
 * employer's form. Never a dead end — it works on any application, with or without the helper.
 */
export function GuidedApplication({ pack, applyUrl, onOpen, onDownloadFile, onExport }: { pack: ApplicationPackSnapshot | Omit<ApplicationPackSnapshot, never>; applyUrl: string; onOpen: () => void; onDownloadFile: (kind: "resume" | "cover_letter") => void; onExport: () => void }) {
  const fields = ORDER.filter((k) => pack.profile[k]);
  const allAnswers = pack.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n");
  return (
    <Card aria-labelledby="wj-guided">
      <h2 id="wj-guided" className="text-[18px] font-semibold text-ink">
        Guided application
      </h2>
      <p className="mt-1 text-[13px] text-ink-3">Your application is ready. Copy each value into the employer&apos;s form, attach your documents, answer what only you can, then submit there.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[14px] bg-surface-2 p-3">
        <span className="min-w-0 flex-1 break-all text-[12px] text-ink-2" data-testid="wj-apply-url">
          {applyUrl}
        </span>
        <Button size="sm" onClick={onOpen} iconRight={<ExternalLink className="size-3.5" aria-hidden />}>
          Open application
        </Button>
        <Button size="sm" variant="outline" onClick={() => copy(applyUrl, "Application link")} icon={<Copy className="size-3.5" aria-hidden />}>
          Copy link
        </Button>
      </div>

      <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Your details</h3>
      {fields.length ? (
        <ul className="mt-2 divide-y divide-line rounded-[14px] border border-line">
          {fields.map((k) => (
            <li key={k} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-ink-3">{PROFILE_LABEL[k]}</p>
                <p className="break-words text-[14px] text-ink">{pack.profile[k]!.value}</p>
                <p className="text-[11px] text-ink-4">{PROVENANCE_LABEL[pack.profile[k]!.provenance]}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => copy(pack.profile[k]!.value, PROFILE_LABEL[k])} aria-label={`Copy ${PROFILE_LABEL[k]}`} icon={<Copy className="size-3.5" aria-hidden />}>
                Copy
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px] text-ink-3">Your Career Profile has no contact details yet.</p>
      )}

      <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-ink-3">Documents</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {pack.resume && (
          <li className="flex items-center gap-3 rounded-[14px] border border-line p-3">
            <FileText className="size-5 shrink-0 text-brand-600" aria-hidden />
            <span className="min-w-0 flex-1 break-all text-[13px] text-ink">{pack.resume.filename}</span>
            <Button size="sm" variant="outline" onClick={() => onDownloadFile("resume")} icon={<Download className="size-3.5" aria-hidden />}>
              Download
            </Button>
          </li>
        )}
        {pack.coverLetter && (
          <li className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line p-3">
            <FileText className="size-5 shrink-0 text-brand-600" aria-hidden />
            <span className="min-w-0 flex-1 break-all text-[13px] text-ink">{pack.coverLetter.filename}</span>
            {pack.coverLetter.text && (
              <Button size="sm" variant="ghost" onClick={() => copy(pack.coverLetter!.text!, "Cover letter")} icon={<Copy className="size-3.5" aria-hidden />}>
                Copy text
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onDownloadFile("cover_letter")} icon={<Download className="size-3.5" aria-hidden />}>
              Download
            </Button>
          </li>
        )}
        {!pack.resume && !pack.coverLetter && <li className="text-[13px] text-ink-3">No documents in this pack.</li>}
      </ul>

      {pack.answers.length > 0 && (
        <>
          <div className="mt-5 flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">Prepared answers</h3>
            <Button size="sm" variant="ghost" onClick={() => copy(allAnswers, "All answers")} icon={<Copy className="size-3.5" aria-hidden />}>
              Copy all answers
            </Button>
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {pack.answers.map((a) => (
              <li key={a.id} className="rounded-[14px] border border-line p-3">
                <p className="text-[13px] font-medium text-ink">{a.question}</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink-2">{a.answer}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-ink-4">{PROVENANCE_LABEL[a.provenance]}</span>
                  <Button size="sm" variant="outline" onClick={() => copy(a.answer, "Answer")} aria-label={`Copy answer to ${a.question}`} icon={<Copy className="size-3.5" aria-hidden />}>
                    Copy
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-5 text-[12px] text-ink-3">Work authorization, sponsorship, salary and any legal or demographic questions are yours to answer on the form.</p>
      <Button className="mt-3" variant="outline" onClick={onExport} icon={<Package className="size-4" aria-hidden />}>
        Download Application Pack
      </Button>
    </Card>
  );
}
