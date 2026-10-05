"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CornerDownLeft, Delete, Loader2, Sparkles } from "lucide-react";
import type { CloudStream } from "@/services/jobs-apply/client";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Input } from "@/components/common/Input";
import { cn } from "@/lib/cn";

type Frame = { src: string; w: number; h: number };
type Link = "connecting" | "live" | "lost" | "ended";

/**
 * The employer's page, live from the cloud browser. Frames come in over a WebSocket; the candidate's
 * taps, scrolls and typing go back the same way — nothing else does. Wonder's filling happens in the
 * page through the helper script; the candidate signs in, answers, and presses the employer's submit
 * button here, in the stream. Nothing on this component submits.
 */
export function CloudBrowser({ stream, fillable, fillDecision, busy, onFill, onEnd, onReconnect }: { stream: CloudStream; fillable: number; fillDecision?: string; busy: boolean; onFill: () => void; onEnd: () => void; onReconnect?: () => Promise<CloudStream | null> }) {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [link, setLink] = useState<Link>("connecting");
  const [host, setHost] = useState("");
  const [text, setText] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const send = useCallback((m: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }, []);

  useEffect(() => {
    let gone = false;
    let attempts = 0;
    let current = stream;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      setLink((l) => (l === "live" ? l : "connecting"));
      const ws = new WebSocket(`${current.streamUrl}?token=${encodeURIComponent(current.streamToken)}`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempts = 0;
        setLink("live");
      };
      ws.onmessage = (e) => {
        let m: { t: string; data?: string; w?: number; h?: number; host?: string };
        try {
          m = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (m.t === "frame" && m.data) setFrame({ src: `data:image/jpeg;base64,${m.data}`, w: m.w ?? current.viewport.width, h: m.h ?? current.viewport.height });
        else if (m.t === "status") setHost(m.host ?? "");
        else if (m.t === "ended") {
          gone = true;
          setLink("ended");
        }
      };
      ws.onclose = () => {
        if (gone) return;
        // A dropped connection: the same token a few times, then a fresh one, then say so.
        if (attempts++ < 4) timer = setTimeout(connect, 600 * attempts);
        else if (onReconnect)
          void onReconnect().then((next) => {
            if (gone) return;
            if (next) {
              current = next;
              attempts = 0;
              connect();
            } else setLink("lost");
          });
        else setLink("lost");
      };
    };
    connect();
    return () => {
      gone = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [stream, onReconnect]);

  /* Taps and scrolls, mapped from the rendered frame back to the page's own pixels. */
  const ptr = useRef<{ startY: number; lastY: number; moved: boolean } | null>(null);
  const toPage = (e: React.PointerEvent | React.WheelEvent) => {
    const box = boxRef.current;
    if (!box || !frame) return null;
    const r = box.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * frame.w, y: ((e.clientY - r.top) / r.height) * frame.h, sy: frame.h / r.height };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    ptr.current = { startY: e.clientY, lastY: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = ptr.current;
    if (!p) return;
    if (!p.moved && Math.abs(e.clientY - p.startY) < 8) return;
    p.moved = true;
    const at = toPage(e);
    if (at) send({ t: "scroll", x: at.x, y: at.y, dy: (p.lastY - e.clientY) * at.sy });
    p.lastY = e.clientY;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = ptr.current;
    ptr.current = null;
    if (!p || p.moved) return;
    const at = toPage(e);
    if (at) send({ t: "tap", x: at.x, y: at.y });
  };
  const onWheel = (e: React.WheelEvent) => {
    const at = toPage(e);
    if (at) send({ t: "scroll", x: at.x, y: at.y, dy: e.deltaY });
  };

  const ratio = frame ? `${frame.w} / ${frame.h}` : `${stream.viewport.width} / ${stream.viewport.height}`;
  const status = link === "live" ? (host ? `Live on ${host}` : "Live") : link === "connecting" ? "Connecting to the cloud browser…" : link === "lost" ? "Lost the connection to the cloud browser." : "This cloud browser has closed.";

  return (
    <Card aria-labelledby="wj-cloud">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="wj-cloud" className="text-[18px] font-semibold text-ink">
            The employer&apos;s page, here
          </h2>
          <p role="status" className="text-[13px] text-ink-3">
            {status}
          </p>
        </div>
        {fillable > 0 && fillDecision !== "skip" && link === "live" && (
          <Button size="sm" loading={busy} onClick={onFill} icon={<Sparkles className="size-4" aria-hidden />}>
            Fill {fillable} field{fillable === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      <div
        ref={boxRef}
        className={cn("relative mx-auto mt-3 w-full max-w-[412px] touch-none select-none overflow-hidden rounded-[14px] border border-line bg-surface-2", link !== "live" && "opacity-80")}
        style={{ aspectRatio: ratio }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (ptr.current = null)}
        onWheel={onWheel}
        role="img"
        aria-label={host ? `The application page on ${host}` : "The application page"}
      >
        {frame ? (
          // eslint-disable-next-line @next/next/no-img-element -- a live stream of JPEG frames, not an asset
          <img src={frame.src} alt="" draggable={false} className="block h-full w-full" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-ink-4">
            {link === "ended" || link === "lost" ? null : <Loader2 className="size-6 animate-spin" aria-hidden />}
          </div>
        )}
      </div>

      {link === "live" && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text) return;
            send({ t: "text", text });
            setText("");
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tap a field above, type here" aria-label="Text to type into the page" className="h-11 min-w-0 flex-1" autoComplete="off" />
          <Button type="submit" size="sm" variant="outline" disabled={!text}>
            Type
          </Button>
          <Button type="button" size="sm" variant="outline" aria-label="Backspace" onClick={() => send({ t: "key", key: "Backspace" })} icon={<Delete className="size-4" aria-hidden />} />
          <Button type="button" size="sm" variant="outline" aria-label="Enter" onClick={() => send({ t: "key", key: "Enter" })} icon={<CornerDownLeft className="size-4" aria-hidden />} />
        </form>
      )}

      <p className="mt-3 text-[12px] text-ink-4">Sign in, answer and press the employer&apos;s own submit button in the page above. Wonder fills; it never submits.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {link === "lost" && onReconnect && (
          <Button size="sm" variant="outline" onClick={() => void onReconnect()}>
            Reconnect
          </Button>
        )}
        {link !== "ended" && (
          <Button size="sm" variant="ghost" onClick={onEnd}>
            Close cloud browser
          </Button>
        )}
      </div>
    </Card>
  );
}
