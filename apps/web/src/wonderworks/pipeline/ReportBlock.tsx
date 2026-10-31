"use client";
import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";

/**
 * Block or report, for modules where people deal with each other (server/modules/safety.ts). A block hides both from each
 * other and ends anything open; they aren't told. A report goes to WonderWorks' reviewers. The module supplies what each
 * press calls; a module with nothing to block (a listing with no conversation yet) leaves `onBlock` out.
 */
export function ReportBlock({ noun, onBlock, onReport, onBlocked }: { noun: string; onBlock?: () => Promise<unknown>; onReport: (reason: string) => Promise<unknown>; onBlocked?: () => void }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await f();
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error("Couldn't do that", (e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-3">
        {onBlock ? `Blocking hides ${noun} from you and you from them, and ends anything open. They aren't told. ` : ""}A report goes to WonderWorks&apos; reviewers.
      </p>
      <div className="flex flex-wrap gap-2">
        {onBlock && (
          <Button size="sm" variant="outline" loading={busy} onClick={async () => (await run(onBlock, "Blocked")) && onBlocked?.()}>
            Block
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setReporting((v) => !v)} aria-expanded={reporting}>
          Report
        </Button>
      </div>
      {reporting && (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => onReport(reason), "Reported")) {
              setReporting(false);
              setReason("");
            }
          }}
        >
          <Textarea aria-label="What's wrong" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Say briefly what's wrong" />
          <Button size="sm" type="submit" loading={busy} disabled={reason.trim().length < 5}>
            Send report
          </Button>
        </form>
      )}
    </div>
  );
}
