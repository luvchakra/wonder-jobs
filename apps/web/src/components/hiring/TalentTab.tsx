"use client";
import { useEffect, useState } from "react";
import { MessageSquare, Search, UserPlus } from "lucide-react";
import type { EmployerJob, TalentProfile } from "@/domain/org/types";
import { hiringApi, type TalentMatch } from "@/services/hiring/client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/common/Button";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";

/**
 * Find candidates: only job seekers who turned on "Open to recruiters", showing only what they chose to show.
 * Shortlist one for a job (with a note for the hiring managers) or write to them.
 */
export function TalentTab({ orgId, onShortlisted, onMessaged }: { orgId: string; onShortlisted: () => void; onMessaged: (conversationId: string) => void }) {
  const [q, setQ] = useState("");
  const [place, setPlace] = useState("");
  const [matches, setMatches] = useState<TalentMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<EmployerJob[]>([]);
  const [acting, setActing] = useState<{ kind: "shortlist" | "message"; who: TalentProfile } | null>(null);
  useEffect(() => {
    hiringApi
      .jobs(orgId)
      .then((d) => setJobs(d.jobs.filter((j) => j.status !== "closed")))
      .catch(() => undefined);
  }, [orgId]);

  const search = async () => {
    setBusy(true);
    try {
      setMatches((await hiringApi.talent(orgId, q, place)).matches);
    } catch (e) {
      toast.error("Couldn't search", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form
        className="mb-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Skills or role — e.g. Kubernetes Go" aria-label="Skills or role" className="flex-1" />
        <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Place (optional)" aria-label="Place" className="sm:w-48" />
        <Button type="submit" loading={busy} icon={<Search className="size-4" aria-hidden />}>
          Find candidates
        </Button>
      </form>
      <p className="mb-3 text-[12px] text-ink-3">Only job seekers who chose to be open to recruiters appear, with what they chose to show.</p>
      {matches === null ? null : matches.length === 0 ? (
        <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">No one open to recruiters matches every word. Try fewer or broader words.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {matches.map(({ profile: p, matchedSkills }) => (
            <li key={p.tenantId} className="rounded-[16px] border border-line bg-surface p-4">
              <p className="text-[15px] font-semibold text-ink">{p.displayName}</p>
              <p className="text-[13px] text-ink-2">{p.headline || "No headline"}</p>
              <p className="mt-1 text-[12px] text-ink-3">{[p.seniority, p.yearsExperience ? `${p.yearsExperience} years` : "", p.locations.join(", "), p.workModes.join(" / ")].filter(Boolean).join(" · ")}</p>
              {p.skills.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1">
                  {p.skills.slice(0, 12).map((s) => (
                    <li key={s} className={cn("rounded-full px-2 py-0.5 text-[11px]", matchedSkills.includes(s) ? "bg-brand-50 font-medium text-brand-700" : "bg-surface-2 text-ink-2")}>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
              {p.summary && <p className="mt-2 line-clamp-3 text-[12px] text-ink-3">“{p.summary}”</p>}
              <div className="mt-3 flex flex-wrap gap-x-4">
                <button type="button" onClick={() => setActing({ kind: "shortlist", who: p })} className="inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-brand-600 hover:underline">
                  <UserPlus className="size-4" aria-hidden /> Shortlist
                </button>
                <button type="button" onClick={() => setActing({ kind: "message", who: p })} className="inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-brand-600 hover:underline">
                  <MessageSquare className="size-4" aria-hidden /> Message
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {acting && (
        <ActDialog
          kind={acting.kind}
          who={acting.who}
          jobs={jobs}
          onClose={() => setActing(null)}
          onDone={async (jobId, text) => {
            if (acting.kind === "shortlist") {
              await hiringApi.addToShortlist(orgId, acting.who.tenantId, text, jobId);
              toast.success(`${acting.who.displayName} shortlisted`, "Report them to your hiring managers from Shortlist.");
              onShortlisted();
            } else {
              const { id } = await hiringApi.startConversation(orgId, acting.who.tenantId, text, jobId);
              toast.success(`Message sent to ${acting.who.displayName}`, "They get a notification and can reply, decline or block.");
              onMessaged(id);
            }
          }}
        />
      )}
    </div>
  );
}

function ActDialog({ kind, who, jobs, onClose, onDone }: { kind: "shortlist" | "message"; who: TalentProfile; jobs: EmployerJob[]; onClose: () => void; onDone: (jobId: string | undefined, text: string) => Promise<void> }) {
  const [jobId, setJobId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const message = kind === "message";
  return (
    <Modal
      open
      onClose={onClose}
      title={message ? `Message ${who.displayName}` : `Shortlist ${who.displayName}`}
      description={message ? "Introduce yourself and the role. They can reply, decline or block your company." : "Add a note for your hiring managers."}
      size="sm"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={message && !text.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onDone(jobId || undefined, text);
                onClose();
              } catch (e) {
                toast.error(message ? "Couldn't send" : "Couldn't shortlist", (e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {message ? "Send" : "Shortlist"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="For which job (optional)" htmlFor="aj">
          <Select id="aj" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">No particular job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={message ? "Message" : "Note for hiring managers"} htmlFor="at">
          <Textarea id="at" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={message ? 4000 : 2000} />
        </Field>
      </div>
    </Modal>
  );
}
