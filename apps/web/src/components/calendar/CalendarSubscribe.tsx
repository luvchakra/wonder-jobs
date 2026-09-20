"use client";
import { useState } from "react";
import { CalendarPlus, Copy } from "lucide-react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { useAuthStore } from "@/store/auth";

/**
 * "Subscribe" to a live-updating feed of real interviews, follow-ups and scheduled runs from Google,
 * Outlook or Apple Calendar. Demo mode has no server-side tenant to sign a link for, so the button
 * doesn't render there rather than offering a link that can't work.
 */
export function CalendarSubscribe() {
  const mode = useAuthStore((s) => s.mode);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (mode !== "user") return null;

  const load = async () => {
    setOpen(true);
    if (url || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/calendar/link");
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't create the calendar link");
      setUrl(data.url);
    } catch (e) {
      toast.error("Couldn't create the calendar link", e instanceof Error ? e.message : undefined);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link", "Select the text in the field and copy it manually.");
    }
  };

  return (
    <>
      <Button variant="outline" icon={<CalendarPlus className="size-4" aria-hidden />} onClick={load}>
        Subscribe
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Subscribe from your calendar app" description="A live feed of your real interviews, follow-ups and scheduled runs — no export, no re-copying.">
        <div className="flex items-center gap-2">
          <Input readOnly value={busy ? "Creating your link…" : (url ?? "")} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar feed URL" />
          <Button variant="outline" icon={<Copy className="size-4" aria-hidden />} disabled={!url} onClick={copy}>
            Copy
          </Button>
        </div>
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-[13px] text-ink-2">
          <li>
            <strong>Google Calendar:</strong> Other calendars → + → From URL → paste it.
          </li>
          <li>
            <strong>Outlook:</strong> Add calendar → Subscribe from web → paste it.
          </li>
          <li>
            <strong>Apple Calendar:</strong> File → New Calendar Subscription → paste it.
          </li>
        </ol>
        <p className="mt-3 text-[12px] text-ink-4">Treat this link like a password — anyone with it can see your upcoming interviews and follow-ups. Calendar apps refresh it every 30 minutes or so; it&apos;s not instant.</p>
      </Modal>
    </>
  );
}
