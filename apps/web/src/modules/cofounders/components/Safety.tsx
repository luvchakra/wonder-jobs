"use client";
import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Textarea } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { call } from "@/wonderworks/api";

/** Block or report a person, a team or a message. A block hides both from each other and is never announced. */
export function Safety({ kind, id, noun, onBlocked }: { kind: "person" | "team" | "message"; id: string; noun: string; onBlocked?: () => void }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const post = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      await call("/api/m/cofounders/safety", { body });
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
        Blocking hides {noun} from you and you from them, and ends anything open. They aren&apos;t told. A report goes to WonderWorks&apos; reviewers.
      </p>
      <div className="flex flex-wrap gap-2">
        {kind !== "message" && (
          <Button size="sm" variant="outline" loading={busy} onClick={async () => (await post({ action: "block", kind, id }, "Blocked")) && onBlocked?.()}>
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
            if (await post({ action: "report", kind, id, reason }, "Reported")) {
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
