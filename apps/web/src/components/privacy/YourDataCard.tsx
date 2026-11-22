"use client";
import { useEffect, useState } from "react";
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
import { moduleById } from "@/modules/registry";
import type { ErasePreview } from "@/domain/privacy/erasePreview";

/**
 * Your data: download everything (access / portability) and delete the account (erasure).
 * The dialog copy describes exactly what `eraseAccount` does — including what is kept and why.
 */
export function YourDataCard() {
  const userId = useAuthStore((s) => s.userId);
  const [busy, setBusy] = useState<"export" | "erase" | null>(null);
  const [erasing, setErasing] = useState(false);
  const [phrase, setPhrase] = useState("");
  // The full warning (owner, 2026-11-22): what deleting does, in this person's own numbers, read when the dialog opens.
  const [preview, setPreview] = useState<ErasePreview | null | undefined>(undefined);
  const [understood, setUnderstood] = useState(false);
  useEffect(() => {
    if (!erasing) return;
    fetch("/api/privacy/erase", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { preview?: ErasePreview } | null) => setPreview(d?.preview ?? null))
      .catch(() => setPreview(null));
  }, [erasing]);
  const sent = preview ? preview.applications + Object.values(preview.requests).reduce((a, b) => a + b, 0) + preview.bookings : 0;
  const contact = grievanceContact();

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
    <Card id="your-data" className="mt-4 scroll-mt-20">
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
            <Button size="sm" variant="ghost" className="text-danger-600" onClick={() => {
                setPreview(undefined);
                setUnderstood(false);
                setErasing(true);
              }} icon={<Trash2 className="size-4" aria-hidden />}>
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
              <Link href="/contact" className="underline">
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
            <Button variant="danger" loading={busy === "erase"} disabled={phrase !== ERASE_PHRASE || (sent > 0 && !understood)} onClick={erase}>
              Delete everything
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13.5px] text-ink-2">
          <p>Deleted straight away: your sign-in, Career Profile, jobs, applications, run history, settings, saved AI keys, notification devices, contact messages linked to this account and the record of what Wonder did for you.</p>
          {preview === undefined ? (
            <p className="text-ink-3">Checking what else this account holds…</p>
          ) : preview ? (
            <Consequences p={preview} />
          ) : null}
          <p>Kept, because the law requires it: payment records (amounts, dates, provider ids and your account id — no profile data) for at least 8 years, and a one-way hash showing that an erasure was requested and completed.</p>
          <p>If you have an active subscription, cancel it first in Plan &amp; billing.</p>
          <p>Want a copy first? Use Download my data before you continue.</p>
          {sent > 0 && (
            <label className="flex items-start gap-2 rounded-[12px] border border-danger-600/30 bg-danger-100 p-3 text-[13px] text-danger-600">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 accent-danger-600" />
              <span>I understand the companies, schools and people I applied to or sent requests to will no longer see them, and this can&apos;t be undone.</span>
            </label>
          )}
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

/** The part of the warning only this account has: what goes for good, and what passes to someone else. */
function Consequences({ p }: { p: ErasePreview }) {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const requests = Object.entries(p.requests).filter(([, k]) => k > 0);
  const gone: string[] = [
    ...(p.applications ? [`${n(p.applications, "application")} you sent with Easy Apply to ${n(p.companies, "company", "companies")}, with your résumé copy and answers: the companies will no longer see them`] : []),
    ...requests.map(([m, k]) => `${n(k, "request")} you sent in ${moduleById(m)?.label ?? m}: whoever received them will no longer see them`),
    ...(p.bookings ? [`${n(p.bookings, "demo booking")}: removed for both sides`] : []),
    ...(p.connections ? [`${n(p.connections, "connection")} on the network, with your conversations: they won't see you any more`] : []),
    ...(p.posts ? [`${n(p.posts, "post")} and update${p.posts === 1 ? "" : "s"} on the network, with their comments and likes`] : []),
    ...(p.communitiesDeleted ? [`${n(p.communitiesDeleted, "community", "communities")} you own with nobody else in ${p.communitiesDeleted === 1 ? "it" : "them"}, with ${p.communitiesDeleted === 1 ? "its" : "their"} discussions`] : []),
  ];
  const passed: string[] = [
    ...(p.workspacesHandedOn ? [`${n(p.workspacesHandedOn, "hiring workspace")} you own: ${p.workspacesHandedOn === 1 ? "it stays" : "they stay"} with the team, and the longest-standing member becomes owner`] : []),
    ...(p.workspacesClosed ? [`${n(p.workspacesClosed, "hiring workspace")} with nobody else in ${p.workspacesClosed === 1 ? "it" : "them"}: kept, with ${p.workspacesClosed === 1 ? "its" : "their"} open jobs closed`] : []),
    ...(p.communitiesHandedOn ? [`${n(p.communitiesHandedOn, "community", "communities")} you own: ${p.communitiesHandedOn === 1 ? "it passes" : "they pass"} to the longest-standing moderator or member`] : []),
  ];
  if (!gone.length && !passed.length) return null;
  return (
    <div className="space-y-2 rounded-[12px] border border-line bg-surface-2 p-3">
      {gone.length > 0 && (
        <>
          <p className="font-semibold text-ink">Also deleted for good</p>
          <ul className="list-disc space-y-1 pl-5">
            {gone.map((g) => (
              <li key={g}>{g}.</li>
            ))}
          </ul>
        </>
      )}
      {passed.length > 0 && (
        <>
          <p className="font-semibold text-ink">Passed on, without your name</p>
          <ul className="list-disc space-y-1 pl-5">
            {passed.map((g) => (
              <li key={g}>{g}.</li>
            ))}
          </ul>
        </>
      )}
      <p className="text-[12.5px] text-ink-3">Your replies in others&apos; discussions lose their words and your name, so the conversation still reads.</p>
    </div>
  );
}
