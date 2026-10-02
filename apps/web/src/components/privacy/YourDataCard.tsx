"use client";
import { useState } from "react";
import Link from "next/link";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { Input } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { ERASE_PHRASE, grievanceContact } from "@/content/privacy";
import { useAuthStore } from "@/store/auth";
import { signOutEverywhere } from "@/lib/auth/browser";
import { downloadBlob } from "@/lib/download";

/**
 * Your data: download everything (access / portability) and delete the account (erasure).
 * The dialog copy describes exactly what `eraseAccount` does — including what is kept and why.
 */
export function YourDataCard() {
  const mode = useAuthStore((s) => s.mode);
  const userId = useAuthStore((s) => s.userId);
  const [busy, setBusy] = useState<"export" | "erase" | null>(null);
  const [erasing, setErasing] = useState(false);
  const [phrase, setPhrase] = useState("");
  const contact = grievanceContact();

  if (mode === "demo") {
    return (
      <Card className="mt-4">
        <p className="text-[15px] font-semibold text-ink">Your data</p>
        <p className="mt-1 text-[13px] text-ink-2">The demo stores nothing on our servers — its sample data lives only in this browser and is cleared when you leave the demo.</p>
      </Card>
    );
  }

  const exportData = async () => {
    setBusy("export");
    try {
      const res = await fetch("/api/privacy/export", { cache: "no-store" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error);
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "wonderjobs-data.json";
      downloadBlob(await res.blob(), name);
      toast.success("Your data is downloading", "One JSON file with everything stored for this account.");
    } catch (e) {
      toast.error("Couldn't download your data", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const erase = async () => {
    setBusy("erase");
    try {
      const res = await fetch("/api/privacy/erase", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: phrase }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error);
      await signOutEverywhere(userId).catch(() => {});
      // A full page load, not client navigation: every in-memory store of the deleted account must go.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/?account=deleted";
    } catch (e) {
      toast.error("Your account wasn't deleted", e instanceof Error ? e.message : undefined);
      setBusy(null);
    }
  };

  return (
    <Card id="your-data" className="mt-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">Your data</p>
          <p className="text-[13px] text-ink-2">
            Download everything stored for this account, or delete it. You can correct your profile any time in{" "}
            <Link href="/app/career-dna" className="text-brand-700 underline">
              Career Profile
            </Link>
            . How we handle it: <Link href="/privacy" className="text-brand-700 underline">privacy notice</Link>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" loading={busy === "export"} onClick={exportData} icon={<Download className="size-4" aria-hidden />}>
              Download my data
            </Button>
            <Button size="sm" variant="ghost" className="text-danger-600" onClick={() => setErasing(true)} icon={<Trash2 className="size-4" aria-hidden />}>
              Delete account
            </Button>
          </div>
          <p className="mt-3 text-[12px] text-ink-3">
            Questions or a complaint about your data:{" "}
            {contact.email ? (
              <>
                {contact.name ? `${contact.name}, ` : ""}
                <a href={`mailto:${contact.email}`} className="underline">
                  {contact.email}
                </a>
              </>
            ) : (
              <Link href="/#contact" className="underline">
                the contact form (choose “Privacy request”)
              </Link>
            )}
            .
          </p>
        </div>
      </div>
      <Modal
        open={erasing}
        onClose={() => (busy ? undefined : setErasing(false))}
        title="Delete your account?"
        description="This can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setErasing(false)} disabled={busy === "erase"}>
              Keep my account
            </Button>
            <Button variant="danger" loading={busy === "erase"} disabled={phrase !== ERASE_PHRASE} onClick={erase}>
              Delete everything
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13.5px] text-ink-2">
          <p>Deleted straight away: your sign-in, Career Profile, jobs, applications, run history, settings, saved AI keys, notification devices, contact messages linked to this account and the record of what Wonder did for you.</p>
          <p>Kept, because the law requires it: payment records (amounts, dates, provider ids and your account id — no profile data) for at least 8 years, and a one-way hash showing that an erasure was requested and completed.</p>
          <p>If you have an active subscription, cancel it first in Plan &amp; billing.</p>
          <p>Want a copy first? Use Download my data before you continue.</p>
          <label className="block">
            <span className="text-[13px] font-medium text-ink">
              Type <span className="font-mono">{ERASE_PHRASE}</span> to confirm
            </span>
            <Input className="mt-1" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        </div>
      </Modal>
    </Card>
  );
}
