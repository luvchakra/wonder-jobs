"use client";
import Link from "next/link";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { HOW_KNOWN, NET_STATUSES, type MemberView, type NetStatus } from "@/domain/network/network";
import { networkApi, type Suggested } from "@/services/network/client";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/common/Button";
import { Field, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";

/**
 * WonderWorks Network's shared parts (owner, 2026-11-20): a member's photo, their card and row, and the Connect sheet.
 * A member is shown only as the server returned them: the parts their own settings allow this viewer.
 */
export const memberHref = (id: string) => `/app/network/${encodeURIComponent(id)}`;

export function MemberAvatar({ m, size, className }: { m: Pick<MemberView, "id" | "name" | "photo">; size: number; className?: string }) {
  return <Avatar name={m.name} size={size} photo={m.photo ? networkApi.photoUrl(m.id) : undefined} className={className} />;
}

const STATUS_TONE: Record<NetStatus, string> = { open_to_work: "bg-success-100 text-success-600", hiring: "bg-info-100 text-info-600", cofounder: "bg-brand-50 text-brand-700", services: "bg-warning-100 text-warning-600" };

export function StatusChips({ statuses, className }: { statuses: NetStatus[]; className?: string }) {
  if (!statuses.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {NET_STATUSES.filter((s) => statuses.includes(s.id)).map((s) => (
        <li key={s.id} className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-semibold", STATUS_TONE[s.id])}>
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** "3 mutual connections, incl. Asha Rao": only what is real. */
export function mutualLine(m: Pick<MemberView, "mutual" | "mutualNames">): string {
  if (!m.mutual) return "";
  const names = m.mutualNames.length ? `, incl. ${m.mutualNames.join(" and ")}` : "";
  return `${m.mutual} mutual connection${m.mutual === 1 ? "" : "s"}${names}`;
}

/** A person in a grid: banner, photo, name, headline, why they're here, and one action. */
export function PersonCard({ m, onConnect }: { m: Suggested; onConnect: (m: Suggested) => void }) {
  return (
    <li className="flex min-w-0 flex-col items-center overflow-hidden rounded-[16px] border border-line bg-surface pb-3 text-center">
      <Link href={memberHref(m.id)} className="flex w-full flex-col items-center">
        <span className="wj-gradient-bg block h-10 w-full" aria-hidden />
        <MemberAvatar m={m} size={60} className="-mt-[30px] ring-[3px] ring-surface" />
        <span className="mt-1.5 max-w-full truncate px-2 text-[14px] font-semibold text-ink">{m.name}</span>
        <span className="line-clamp-2 min-h-[2.4em] px-2.5 text-[11.5px] leading-[1.2] text-ink-2">{m.headline}</span>
      </Link>
      {m.reason && <span className="mt-1 px-2 text-[11px] font-medium text-brand-600">{m.reason}</span>}
      <span className="mt-2 w-full px-2.5">
        {m.relation === "pending_out" ? (
          <span className="flex h-9 items-center justify-center rounded-full border border-line text-[13px] font-medium text-ink-3">Requested</span>
        ) : m.relation === "connected" ? (
          <span className="flex h-9 items-center justify-center rounded-full border border-line text-[13px] font-medium text-ink-3">Connected</span>
        ) : m.canRequest ? (
          <Button size="sm" variant="outline" full onClick={() => onConnect(m)}>
            Connect
          </Button>
        ) : (
          <Button size="sm" variant="outline" full href={memberHref(m.id)}>
            View
          </Button>
        )}
      </span>
    </li>
  );
}

/** A person in a list, with whatever follows on the right (an action or two). */
export function PersonRow({ m, sub, children }: { m: MemberView; sub?: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
      <Link href={memberHref(m.id)} aria-label={m.name}>
        <MemberAvatar m={m} size={48} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={memberHref(m.id)} className="block truncate text-[14px] font-semibold text-ink hover:underline">
          {m.name}
        </Link>
        {m.headline && <p className="truncate text-[12px] text-ink-2">{m.headline}</p>}
        {sub && <p className="mt-0.5 line-clamp-2 break-words text-[11.5px] text-ink-3">{sub}</p>}
        {children && <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </li>
  );
}

export function Place({ m }: { m: Pick<MemberView, "location"> }) {
  if (!m.location) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-[12.5px] text-ink-3">
      <MapPin className="size-3.5 shrink-0" aria-hidden /> <span className="min-w-0 break-words">{m.location}</span>
    </p>
  );
}

/** Ask to connect: how you know them and an optional note. What it sends is on the sheet, so Send is the confirmation. */
export function ConnectSheet({ m, onClose, onSent }: { m: MemberView; onClose: () => void; onSent: (m: MemberView) => void }) {
  const [how, setHow] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = m.name.split(" ")[0];
  return (
    <Modal
      open
      onClose={onClose}
      title={`Connect with ${first}`}
      description={[mutualLine(m), m.sharedSkills.length ? `${m.sharedSkills.length} shared skill${m.sharedSkills.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ") || undefined}
      size="sm"
      footer={
        <div className="flex w-full flex-col gap-2">
          {error && (
            <p role="alert" className="text-[13px] text-danger-600">
              {error}
            </p>
          )}
          <Button
            full
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                onSent((await networkApi.connect(m.id, how, note)).member);
                onClose();
              } catch (e) {
                setError((e as Error).message || "Couldn't send. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Send request
          </Button>
          <p className="text-center text-[11.5px] text-ink-3">
            {first} sees your network profile and this note, and can accept or ignore it. Your email and phone are never shared.
          </p>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink">How do you know {first}? (optional)</legend>
          <div className="flex flex-wrap gap-2">
            {HOW_KNOWN.map((h) => (
              <button key={h} type="button" aria-pressed={how === h} onClick={() => setHow(how === h ? "" : h)} className={cn("min-h-10 rounded-full border px-3.5 text-[13px] font-medium", how === h ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-2")}>
                {h}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Add a note (optional)" htmlFor="net-note" hint={`${note.length} / 300`}>
          <Textarea id="net-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
