"use client";
import Link from "next/link";
import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { SquarePlus } from "lucide-react";
import { NETWORK_HREF } from "./nav";
import { getClientMode } from "@/lib/mode";
import { useHydration } from "@/store/hydration";
import { useSelectedModule } from "./useModuleNav";
import { useChromeSlots } from "./slots";
import { useNetworkMode } from "./networkMode";

const PostSheet = dynamic(() => import("@/components/network/PostSheet").then((m) => m.PostSheet), { ssr: false });
const NewMessageSheet = dynamic(() => import("@/components/network/NewMessageSheet").then((m) => m.NewMessageSheet), { ssr: false });

/**
 * The second UI's + in the top bar, next to the network icon (owner, 2026-11-28: "on plus sign click it can directly
 * open the new entry creation page, no need to give network option"). One press, one thing, nothing to choose:
 *  - in a module with its own new entry (post a job, host an event…), that entry's page;
 *  - on Network's pages, where there is no module entry: a post to the network, or on Messages a new message.
 * Elsewhere (a module with no entry of its own) there is no +. Signed-in members only, as before.
 */
export function CreateButton() {
  const pathname = usePathname();
  const slots = useChromeSlots();
  const selected = useSelectedModule();
  const onNetwork = useNetworkMode();
  const signedIn = useHydration((h) => h.hydrated) && getClientMode().mode === "user";
  const [sheet, setSheet] = useState<"post" | "message" | null>(null);
  if (!signedIn) return null;
  const entry = onNetwork ? null : (slots.postFor?.(selected) ?? null);
  const button = "wj-top-icon grid size-10 shrink-0 place-items-center rounded-full text-ink hover:bg-bg-soft active:scale-95";
  if (entry) {
    // Already on the entry's page: nothing new to open.
    if (pathname === entry.href.split("?")[0]) return null;
    return (
      <Link href={entry.href} aria-label={entry.label} title={entry.label} className={button}>
        <SquarePlus className="size-6" aria-hidden />
      </Link>
    );
  }
  if (!onNetwork) return null;
  const onMessages = pathname === `${NETWORK_HREF}/messages`;
  const label = onMessages ? "New message" : "New post";
  return (
    <>
      <button type="button" aria-label={label} title={label} onClick={() => setSheet(onMessages ? "message" : "post")} className={button}>
        <SquarePlus className="size-6" aria-hidden />
      </button>
      {sheet === "post" && <PostSheet onClose={() => setSheet(null)} />}
      {sheet === "message" && <NewMessageSheet onClose={() => setSheet(null)} />}
    </>
  );
}
