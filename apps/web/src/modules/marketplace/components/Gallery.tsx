"use client";
import { useState } from "react";
import { photoSrc } from "../manifest";

/** A listing's photos, through the listing's own route: the big one and thumbnails to pick another. Nothing without photos. */
export function Gallery({ listingId, photos, title }: { listingId: string; photos: string[]; title: string }) {
  const [i, setI] = useState(0);
  if (!photos.length) return null;
  return (
    <div className="mb-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoSrc(listingId, photos[i])} alt={`${title}, photo ${i + 1} of ${photos.length}`} className="max-h-[420px] w-full rounded-[16px] border border-line bg-bg-soft object-contain" />
      {photos.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Photos">
          {photos.map((p, n) => (
            <button key={p} type="button" aria-label={`Photo ${n + 1}`} aria-pressed={n === i} onClick={() => setI(n)} className={`overflow-hidden rounded-[10px] border-2 ${n === i ? "border-brand-500" : "border-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc(listingId, p)} alt="" width={56} height={56} loading="lazy" className="size-14 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
