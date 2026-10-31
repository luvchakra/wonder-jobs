"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { coverSrc } from "../domain";

/** Where the picture sits: across the top of a Find card or a My events card (reaching the card's edges), or as the event page's wide header. */
const PLACE = {
  // An image's width doesn't grow with a negative margin, so a card's picture is as wide as the card's padding adds.
  card: "-mx-4 -mt-3 mb-3 aspect-[16/7] w-[calc(100%+2rem)] max-w-none rounded-t-[inherit]",
  stage: "-mx-3 -mt-3 aspect-[16/8] w-[calc(100%+1.5rem)] max-w-none rounded-t-[inherit]",
  page: "mb-4 aspect-[16/7] w-full rounded-[16px]",
  thumb: "size-14 shrink-0 rounded-[12px]",
} as const;

/**
 * An event's cover photo, one picture shown the same everywhere the event appears. Nothing is drawn when the event has no
 * cover (or its picture can't be loaded), so a card without one is unchanged. The address carries the cover's version, so
 * the browser keeps each picture for good and fetches a new one only when the organiser changes it.
 */
export function Cover({ postingId, cover, place, alt = "" }: { postingId: string; cover: number | undefined; place: keyof typeof PLACE; alt?: string }) {
  const [failed, setFailed] = useState(false);
  const src = coverSrc(postingId, cover);
  if (!src || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- our own cached, size-limited picture; next/image would add a proxy hop for a private, versioned address
    <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn("block overflow-hidden bg-bg-soft object-cover", PLACE[place])} />
  );
}
