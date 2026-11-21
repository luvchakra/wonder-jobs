"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberView } from "@/domain/network/network";
import { networkApi } from "@/services/network/client";
import { Input } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { MemberAvatar } from "./parts";

/**
 * New message (owner, 2026-11-21: "clicking + here should give an option to send message to a person"): pick one of the
 * member's connections and their conversation opens. On the network only connections can write to each other.
 */
export function NewMessageSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [list, setList] = useState<MemberView[] | null>(null);
  const [failed, setFailed] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    networkApi
      .mine()
      .then((d) => setList(d.connections.filter((m) => m.connectionId)))
      .catch((e) => setFailed((e as Error).message));
  }, []);
  const shown = useMemo(() => {
    const w = q.trim().toLowerCase();
    return (list ?? []).filter((m) => !w || [m.name, m.headline].join(" ").toLowerCase().includes(w));
  }, [list, q]);
  return (
    <Modal open onClose={onClose} title="New message" description="To one of your connections" size="sm">
      {failed ? (
        <p className="py-4 text-[13px] text-ink-3">{failed}</p>
      ) : list === null ? (
        <p className="py-4 text-[13px] text-ink-3">Loading…</p>
      ) : list.length === 0 ? (
        <p className="py-2 text-[13.5px] text-ink-2">
          On the network you can write to your connections. You have none yet:{" "}
          <Link href="/app/network?tab=people" onClick={onClose} className="font-semibold text-brand-600 hover:underline">
            find people
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-2 pb-1">
          {list.length > 6 && <Input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your connections" aria-label="Search your connections" />}
          <ul className="-mx-2 flex max-h-[55dvh] flex-col overflow-y-auto">
            {shown.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`/app/network/messages/${encodeURIComponent(m.connectionId!)}`);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 rounded-[12px] px-2 text-left hover:bg-bg-soft"
                >
                  <MemberAvatar m={m} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{m.name}</span>
                    {m.headline && <span className="block truncate text-[12px] text-ink-3">{m.headline}</span>}
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-3 text-[13px] text-ink-3">No connection matches “{q.trim()}”.</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}
