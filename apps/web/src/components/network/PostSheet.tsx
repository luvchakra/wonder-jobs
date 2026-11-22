"use client";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { moduleById } from "@/modules/registry";
import { ListingCard } from "./ListingCard";
import { networkApi, type PostAudience } from "@/services/network/client";
import { AUDIENCE_SEEN } from "./audience";
import { usePostTarget, type PostAbout } from "@/wonderworks/chrome/postTarget";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/common/Button";
import { Select } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";

const MAX_PHOTOS = 4;
const LONG_SIDE = 2048;

/** The chosen photo shrunk to at most LONG_SIDE px as a JPEG: small enough to send, and drawn afresh, so it carries no metadata. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare the photo.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("This browser can't prepare the photo.");
  return blob;
}

type Photo = { key: string; url: string; id?: string };

/**
 * A new network post, opened from the + in any module (owner, 2026-11-21: "use the + icon to create new post"). It
 * shows exactly what goes and to whom, so Post is the confirmation. The listing on screen, if any, is attached and can
 * be taken off; a post carrying a listing is marked with that listing's module, and a post without one names no module.
 */
export function PostSheet({ attach, onClose }: { /** A listing to attach instead of the one on screen (Share → My network on a card). */ attach?: PostAbout; onClose: () => void }) {
  const onScreen = usePostTarget((s) => s.about);
  const bump = usePostTarget((s) => s.bump);
  const [about, setAbout] = useState<PostAbout | null>(attach ?? onScreen);
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<PostAudience>("connections");
  const [busy, setBusy] = useState(false);
  const [me, setMe] = useState<{ name: string } | null | undefined>(undefined);
  // Photos (owner, 2026-11-21): up to four, each sent while the member writes and kept as theirs alone until Post.
  const [photos, setPhotos] = useState<Photo[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const posted = useRef(false);
  const kept = useRef<Photo[]>([]);
  useEffect(() => {
    kept.current = photos;
  }, [photos]);
  // Closing without posting takes back what was sent.
  useEffect(
    () => () => {
      for (const p of kept.current) {
        URL.revokeObjectURL(p.url);
        if (p.id && !posted.current) void networkApi.discard(p.id).catch(() => {});
      }
    },
    [],
  );
  const addPhotos = async (files: File[]) => {
    for (const file of files.slice(0, MAX_PHOTOS - photos.length)) {
      const key = Math.random().toString(36).slice(2);
      try {
        const blob = await shrink(file);
        const url = URL.createObjectURL(blob);
        setPhotos((ps) => [...ps, { key, url }]);
        const id = await networkApi.upload(blob);
        setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, id } : p)));
      } catch (e) {
        setPhotos((ps) => ps.filter((p) => p.key !== key));
        toast.error("Couldn't add that photo", (e as Error).message);
      }
    }
  };
  const removePhoto = (p: Photo) => {
    setPhotos((ps) => ps.filter((x) => x.key !== p.key));
    URL.revokeObjectURL(p.url);
    if (p.id) void networkApi.discard(p.id).catch(() => {});
  };
  const uploading = photos.some((p) => !p.id);
  useEffect(() => {
    networkApi
      .me()
      .then((d) => setMe(d.profile ? { name: d.profile.name } : null))
      .catch(() => setMe(null));
  }, []);

  const post = async () => {
    setBusy(true);
    try {
      await networkApi.post(text.trim(), audience, { ...(about ? { about: { page: about.page, title: about.title } } : {}), ...(about?.module ? { module: about.module } : {}), ...(photos.length ? { media: photos.map((p) => p.id!) } : {}) });
      posted.current = true;
      bump();
      toast.success("Posted", AUDIENCE_SEEN[audience]);
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
      description="To your network"
      size="md"
      footer={
        joined ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Select value={audience} onChange={(e) => setAudience(e.target.value as PostAudience)} aria-label="Who sees this post" className="mr-auto h-10 w-auto min-w-0">
              <option value="connections">My connections</option>
              <option value="everyone">Everyone on the network</option>
              <option value="only_me">Only me</option>
            </Select>
            <Button loading={busy} disabled={uploading || (!text.trim() && !photos.length)} onClick={post}>
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
            <div className="relative">
              <ListingCard page={about.page} fallback={about.title} moduleLabel={moduleById(about.module)?.label ?? ""} link={false} />
              <button type="button" aria-label="Remove the attached listing" onClick={() => setAbout(null)} className="absolute right-2 top-4 grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/75">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}
          {photos.length > 0 && (
            <ul className="grid grid-cols-4 gap-2">
              {photos.map((p) => (
                <li key={p.key} className="relative aspect-square overflow-hidden rounded-[12px] bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the member's own photo, from this device */}
                  <img src={p.url} alt="A photo you added" className="size-full object-cover" />
                  {!p.id && (
                    <span className="absolute inset-0 grid place-items-center bg-black/30 text-white">
                      <Loader2 className="size-5 animate-spin" aria-label="Adding" />
                    </span>
                  )}
                  <button type="button" aria-label="Remove this photo" onClick={() => removePhoto(p)} className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white">
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between">
            <input
              ref={picker}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = "";
                void addPhotos(files);
              }}
            />
            <button type="button" onClick={() => picker.current?.click()} disabled={photos.length >= MAX_PHOTOS} className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-2 text-[13px] font-semibold text-brand-600 hover:bg-bg-soft disabled:text-ink-4">
              <ImagePlus className="size-5" aria-hidden /> Photo
            </button>
            <p className="text-[11px] text-ink-4">{text.length} / 1500</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
