"use client";
import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { call } from "@/wonderworks/api";
import { cn } from "@/lib/cn";

const REASONS = [
  { id: "scam", label: "A scam or fraud" },
  { id: "spam", label: "Spam or a duplicate" },
  { id: "offensive", label: "Offensive or abusive" },
  { id: "illegal", label: "Illegal, or breaks the law" },
  { id: "wrong", label: "Wrong or misleading details" },
  { id: "other", label: "Something else" },
] as const;

/**
 * "Report this listing", at the foot of every module's listing page (2026-11-03). Goes to WonderWorks' reviewers; once
 * enough different people report a listing it's hidden from everyone. The poster isn't told who reported it.
 */
export function ReportListing({ module, id, title }: { module: string; id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const send = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await call("/api/listings/report", { body: { module, id, reason, note: note.trim(), title } });
      setSent(true);
      setOpen(false);
      toast.success("Thanks, it's reported", "WonderWorks reviews reports. The poster isn't told who reported it.");
    } catch (e) {
      toast.error("Couldn't send the report", (e as { status?: number }).status === 401 ? "Sign in to report a listing." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="mt-4 flex justify-center">
        <button type="button" onClick={() => setOpen(true)} disabled={sent} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-danger-600 hover:underline disabled:text-ink-4 disabled:no-underline">
          <Flag className="size-3.5" aria-hidden /> {sent ? "Reported" : "Report this listing"}
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Report this listing"
        description="What's wrong with it? WonderWorks reviews every report; the poster isn't told who sent it."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={send} loading={busy} disabled={!reason}>
              Send report
            </Button>
          </div>
        }
      >
        <div role="radiogroup" aria-label="Reason" className="flex flex-col gap-1.5">
          {REASONS.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={reason === r.id} onClick={() => setReason(r.id)} className={cn("rounded-[12px] border px-3 py-2 text-left text-[14px]", reason === r.id ? "border-brand-400 bg-brand-50 font-medium text-brand-700" : "border-line text-ink-2 hover:border-line-strong")}>
              {r.label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex flex-col gap-1 text-[12px] text-ink-3">
          Anything to add (optional)
          <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </Modal>
    </>
  );
}
