import type { AIProviderId } from "@/domain/ai/types";
import { WonderMark } from "@/components/brand/WonderLogo";
import { cn } from "@/lib/cn";

/** Neutral provider marks (letter tiles) — no vendor logos, so brand guidelines are respected. */
export function ProviderMark({ id, size = 36, className }: { id: AIProviderId; size?: number; className?: string }) {
  const base = cn("inline-flex shrink-0 items-center justify-center rounded-[12px] border border-line bg-surface font-bold", className);
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (id === "wonderjobs")
    return (
      <span className={base} style={style} aria-hidden>
        <WonderMark size={size * 0.62} />
      </span>
    );
  const map: Record<Exclude<AIProviderId, "wonderjobs">, { letter: string; color: string }> = { anthropic: { letter: "A", color: "#c2410c" }, openai: { letter: "O", color: "#111827" }, gemini: { letter: "G", color: "#2563eb" } };
  return (
    <span className={base} style={{ ...style, color: map[id].color }} aria-hidden>
      {map[id].letter}
    </span>
  );
}
