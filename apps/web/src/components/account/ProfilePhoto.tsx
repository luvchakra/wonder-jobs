"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { toast } from "@/components/feedback/Toast";
import { getClientMode } from "@/lib/mode";
import { useUIStore } from "@/store/ui";

const SIDE = 320;

/** The chosen image, cropped to its centre square and shrunk to SIDE px as a JPEG — small enough to keep with the account. */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIDE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare the photo.");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
  if (!blob) throw new Error("This browser can't prepare the photo.");
  return blob;
}

/** The Account page's avatar: the candidate's photo (or initials) with a camera button to add, change or remove it. */
export function ProfilePhoto({ name, size = 64 }: { name: string; size?: number }) {
  const version = useUIStore((s) => s.photoVersion);
  const bump = useUIStore((s) => s.bumpPhoto);
  const [has, setHas] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const signedIn = getClientMode().mode === "user";

  useEffect(() => {
    if (!signedIn) return;
    const img = new Image();
    img.onload = () => setHas(true);
    img.onerror = () => setHas(false);
    img.src = `/api/avatar?v=${version}`;
  }, [version, signedIn]);

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const body = await squareJpeg(file);
      const res = await fetch("/api/avatar", { method: "PUT", headers: { "content-type": "image/jpeg" }, body });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't save the photo.");
      bump();
      toast.success("Photo updated");
    } catch (e) {
      toast.error("Photo not saved", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setMenu(false);
    setBusy(true);
    const res = await fetch("/api/avatar", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast.error("Photo not removed", "Try again in a moment.");
    bump();
  };

  if (!signedIn) return <Avatar name={name} size={size} />;
  return (
    <span className="relative shrink-0">
      <Avatar name={name} size={size} self />
      <button
        type="button"
        aria-label={has ? "Change or remove your photo" : "Add a profile photo"}
        aria-expanded={has ? menu : undefined}
        onClick={() => (has ? setMenu((m) => !m) : input.current?.click())}
        className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-surface bg-brand-600 text-white shadow-sm hover:bg-brand-700"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Camera className="size-3.5" aria-hidden />}
      </button>
      {menu && (
        <span role="menu" className="absolute left-0 top-full z-20 mt-2 flex w-44 flex-col rounded-[14px] border border-line bg-surface p-1.5 shadow-lg">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(false);
              input.current?.click();
            }}
            className="rounded-[10px] px-3 py-2 text-left text-sm text-ink-2 hover:bg-bg-soft hover:text-ink"
          >
            Change photo
          </button>
          <button type="button" role="menuitem" onClick={() => void remove()} className="rounded-[10px] px-3 py-2 text-left text-sm text-danger-600 hover:bg-bg-soft">
            Remove photo
          </button>
        </span>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f);
        }}
      />
    </span>
  );
}
