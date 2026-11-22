"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Globe2, Lock } from "lucide-react";
import { MODULES, isLive, moduleById } from "@/modules/registry";
import { LIMITS, type Community, type CommunityInput } from "@/domain/network/communities";
import { cn } from "@/lib/cn";
import { Button } from "@/components/common/Button";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";

const TONES = ["from-brand-500 to-pink-400", "from-sky-500 to-brand-500", "from-emerald-500 to-sky-500", "from-amber-500 to-pink-500", "from-fuchsia-500 to-brand-600", "from-teal-500 to-emerald-500"];
const toneOf = (id: string) => TONES[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TONES.length];

/** A community's mark: its first letter on a gradient tile, the same colour every time. */
export function CommunityAvatar({ c, size = 44, className }: { c: Pick<Community, "id" | "name">; size?: number; className?: string }) {
  return (
    <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.42 }} className={cn("grid shrink-0 place-items-center rounded-[28%] bg-gradient-to-br font-semibold text-white", toneOf(c.id), className)}>
      {c.name.trim().charAt(0).toUpperCase() || "#"}
    </span>
  );
}

/** The module a community or discussion is about, as a small chip; nothing when it names none. */
export function ModuleChip({ module, className }: { module?: string; className?: string }) {
  const m = module ? moduleById(module) : undefined;
  if (!m) return null;
  return <span className={cn("inline-flex items-center rounded-full bg-brand-50 px-2 py-px text-[10.5px] font-semibold text-brand-700", className)}>{m.label}</span>;
}

export function PrivacyChip({ c }: { c: Pick<Community, "visibility" | "joinPolicy"> }) {
  const Icon = c.visibility === "private" ? Lock : Globe2;
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-ink-3">
      <Icon className="size-3" aria-hidden />
      {c.visibility === "private" ? "Private" : "Public"}
      {c.joinPolicy === "approval" ? " · approval to join" : ""}
    </span>
  );
}

/** Start or edit a community: name, about, rules, who can read it and how people join. The button is the confirmation. */
export function CommunitySheet({ start, onClose, save }: { start?: CommunityInput; onClose: () => void; save: (c: CommunityInput) => Promise<void> }) {
  const [c, setC] = useState<CommunityInput>(start ?? { name: "", about: "", rules: "", visibility: "public", joinPolicy: "open", module: "" });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CommunityInput>(k: K, v: CommunityInput[K]) => setC((x) => ({ ...x, [k]: v }));
  return (
    <Modal
      open
      onClose={onClose}
      title={start ? "Edit community" : "New community"}
      description={start ? undefined : "A place on the network for people who share an interest. You'll be its owner."}
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={c.name.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                await save(c);
              } catch (e) {
                toast.error(start ? "Couldn't save" : "Couldn't create it", (e as Error).message);
                setBusy(false);
              }
            }}
          >
            {start ? "Save" : "Create"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Name" htmlFor="cm-name">
          <Input id="cm-name" autoFocus maxLength={LIMITS.name} value={c.name} onChange={(e) => set("name", e.target.value)} placeholder="Identity & access leaders" />
        </Field>
        <Field label="What it's about" htmlFor="cm-about">
          <Textarea id="cm-about" rows={3} maxLength={LIMITS.about} value={c.about} onChange={(e) => set("about", e.target.value)} placeholder="Who it's for and what you talk about" />
        </Field>
        <Field label="Rules (optional)" htmlFor="cm-rules">
          <Textarea id="cm-rules" rows={3} maxLength={LIMITS.rules} value={c.rules} onChange={(e) => set("rules", e.target.value)} placeholder={"Be kind\nNo recruiting spam"} />
        </Field>
        <Field label="Topic (optional)" htmlFor="cm-topic">
          <Select id="cm-topic" value={c.module ?? ""} onChange={(e) => set("module", e.target.value)}>
            <option value="">No particular module</option>
            {MODULES.filter(isLive).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Who can read it" htmlFor="cm-vis">
            <Select id="cm-vis" value={c.visibility} onChange={(e) => set("visibility", e.target.value as CommunityInput["visibility"])}>
              <option value="public">Anyone on the network</option>
              <option value="private">Members only</option>
            </Select>
          </Field>
          <Field label="How people join" htmlFor="cm-join">
            <Select id="cm-join" value={c.joinPolicy} onChange={(e) => set("joinPolicy", e.target.value as CommunityInput["joinPolicy"])}>
              <option value="open">Anyone can join</option>
              <option value="approval">Moderators approve</option>
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/** A round back arrow at a page's top left (owner, 2026-11-22): to the page the member came from, or, opened from a link
 * with nothing to go back to, to `fallback` (the page above this one). */
export function BackButton({ fallback, label, className }: { fallback: string; label: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className={cn("grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2 shadow-sm hover:bg-bg-soft hover:text-ink active:scale-95", className)}
    >
      <ArrowLeft className="size-[18px]" aria-hidden />
    </button>
  );
}
