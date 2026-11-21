"use client";
import { useEffect, useState } from "react";
import { Link2, X } from "lucide-react";
import { networkApi } from "@/services/network/client";
import { usePostTarget, type PostAbout } from "@/wonderworks/chrome/postTarget";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/common/Button";
import { Select } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";

/**
 * A new network post, opened from the + in any module (owner, 2026-11-21: "use the + icon to create new post"). It
 * shows exactly what goes and to whom, so Post is the confirmation. The listing on screen, if any, is attached and can
 * be taken off; the post is marked with the module it came from.
 */
export function PostSheet({ module, moduleLabel, attach, onClose }: { module: string; moduleLabel?: string; /** A listing to attach instead of the one on screen (Share → My network on a card). */ attach?: PostAbout; onClose: () => void }) {
  const onScreen = usePostTarget((s) => s.about);
  const bump = usePostTarget((s) => s.bump);
  const [about, setAbout] = useState<PostAbout | null>(attach ?? onScreen);
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<"connections" | "everyone">("connections");
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<{ name: string } | null | undefined>(undefined);
  useEffect(() => {
    networkApi
      .me()
      .then((d) => setMe(d.profile ? { name: d.profile.name } : null))
      .catch(() => setMe(null));
  }, []);

  const post = async () => {
    setBusy(true);
    try {
      await networkApi.post(text.trim(), audience, { ...(about ? { about: { page: about.page, title: about.title } } : {}), module: about?.module ?? module });
      bump();
      toast.success("Posted", audience === "everyone" ? "Everyone on the network can see it." : "Your connections can see it.");
      onClose();
    } catch (e) {
      toast.error("Couldn't post", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const joined = !!me;
  return (
    <Modal
      open
      onClose={onClose}
      title="New post"
      description={moduleLabel ? `From ${moduleLabel}, to your network` : "To your network"}
      size="md"
      footer={
        joined ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Select value={audience} onChange={(e) => setAudience(e.target.value as "connections" | "everyone")} aria-label="Who sees this post" className="mr-auto h-10 w-auto min-w-0">
              <option value="connections">My connections</option>
              <option value="everyone">Everyone on the network</option>
            </Select>
            <Button loading={busy} disabled={!text.trim()} onClick={post}>
              Post
            </Button>
          </div>
        ) : undefined
      }
    >
      {me === undefined ? (
        <p className="py-6 text-center text-[13px] text-ink-3">Loading…</p>
      ) : !joined ? (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-[14px] text-ink-2">Posts go to the people you&apos;re connected with on WonderWorks. Join the network first: your network profile comes from your Career Profile, and you choose what it shows.</p>
          <Button href="/app/network/profile" onClick={onClose}>
            Set up my network profile
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Avatar name={me.name} size={40} self />
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={1500} placeholder={about ? "Say something about this" : "What do you want to share?"} aria-label="Write a post" className="min-h-28 flex-1 resize-none bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-ink-4" />
          </div>
          {about && (
            <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-3">
              <Link2 className="size-4 shrink-0 text-brand-600" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-4">Attached</span>
                <span className="block truncate text-[13.5px] font-medium text-ink">{about.title}</span>
              </span>
              <button type="button" aria-label="Remove the attached listing" onClick={() => setAbout(null)} className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-bg-soft hover:text-ink">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}
          <p className="text-right text-[11px] text-ink-4">{text.length} / 1500</p>
        </div>
      )}
    </Modal>
  );
}
