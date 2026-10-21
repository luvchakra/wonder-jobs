"use client";
import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/common/Button";

/** Share on a careers job page: the device's own share sheet where there is one, otherwise the link is copied. */
export function ShareJobLink({ title }: { title: string }) {
  const [note, setNote] = useState<string | null>(null);
  const share = async () => {
    const url = window.location.href.split("#")[0];
    try {
      if (typeof navigator.share === "function") return void (await navigator.share({ title, url }));
      await navigator.clipboard.writeText(url);
      setNote("Link copied");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote(url);
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={share}>
        <Share2 className="size-4" aria-hidden /> Share
      </Button>
      {note && (
        <span role="status" className="break-all text-[13px] text-ink-3">
          {note}
        </span>
      )}
    </span>
  );
}
