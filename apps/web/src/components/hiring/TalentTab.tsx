"use client";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { EmployerJob, TalentProfile } from "@/domain/org/types";
import { hiringApi, type TalentMatch } from "@/services/hiring/client";
import { Button } from "@/components/common/Button";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { TalentCard, TalentProfileView } from "./TalentCard";

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
  const [viewing, setViewing] = useState<{ p: TalentProfile; matched: string[] } | null>(null);
  // Suggested for one of the workspace's jobs (its skills, and its city unless it's remote), picked instead of typing.
  const [forJob, setForJob] = useState("");
  const suggest = async (jobId: string) => {
    setForJob(jobId);
    if (!jobId) return setMatches(null);
    setBusy(true);
    try {
      setMatches((await hiringApi.suggestTalent(orgId, jobId)).matches);
    } catch (e) {
      toast.error("Couldn't suggest anyone", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    hiringApi
      .jobs(orgId)
      .then((d) => setJobs(d.jobs.filter((j) => j.status !== "closed")))
      .catch(() => undefined);
  }, [orgId]);

  const search = async () => {
    setForJob("");
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
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Skills or role — e.g. Kubernetes Go" aria-label="Skills or role" className="sm:flex-1" />
        <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Place (optional)" aria-label="Place" className="sm:w-48" />
        <Button type="submit" loading={busy} icon={<Search className="size-4" aria-hidden />}>
          Find candidates
        </Button>
      </form>
      {jobs.length > 0 && (
        <label className="mb-2 flex items-center gap-2 text-[13px] text-ink-2">
          Or suggest for
          <Select value={forJob} onChange={(e) => void suggest(e.target.value)} aria-label="Suggest candidates for a job" className="h-9 w-auto min-w-0 max-w-[16rem]">
            <option value="">Pick a job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </Select>
        </label>
      )}
      <p className="mb-3 text-[12px] text-ink-3">Only job seekers who chose to be open to recruiters appear, with what they chose to show.</p>
      {matches === null ? null : matches.length === 0 ? (
        <p className="rounded-[16px] border border-line bg-surface p-4 text-[14px] text-ink-3">{forJob ? "No one open to recruiters has this job's skills in its city yet. Add skills to the job, or search by words." : "No one open to recruiters matches every word. Try fewer or broader words."}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {matches.map(({ profile: p, matchedSkills }) => (
            <TalentCard key={p.tenantId} orgId={orgId} p={p} matched={matchedSkills} onOpen={() => setViewing({ p, matched: matchedSkills })} onShortlist={() => setActing({ kind: "shortlist", who: p })} onMessage={() => setActing({ kind: "message", who: p })} />
          ))}
        </ul>
      )}
      {viewing && !acting && (
        <TalentProfileView orgId={orgId} p={viewing.p} matched={viewing.matched} onClose={() => setViewing(null)} onShortlist={() => setActing({ kind: "shortlist", who: viewing.p })} onMessage={() => setActing({ kind: "message", who: viewing.p })} />
      )}
      {acting && (
        <ActDialog
          kind={acting.kind}
          who={acting.who}
          jobs={jobs}
          jobId={forJob}
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
            setViewing(null);
          }}
        />
      )}
    </div>
  );
}

function ActDialog({ kind, who, jobs, jobId: forJob = "", onClose, onDone }: { kind: "shortlist" | "message"; who: TalentProfile; jobs: EmployerJob[]; jobId?: string; onClose: () => void; onDone: (jobId: string | undefined, text: string) => Promise<void> }) {
  const [jobId, setJobId] = useState(forJob);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // In the dialog itself: a toast would sit behind it.
  const [error, setError] = useState<string | null>(null);
  const message = kind === "message";
  return (
    <Modal
      open
      onClose={onClose}
      title={message ? `Message ${who.displayName}` : `Shortlist ${who.displayName}`}
      description={message ? "Introduce yourself and the role. They can reply, decline or block your company." : "Add a note for your hiring managers."}
      size="sm"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {error && (
            <p role="alert" className="mr-auto basis-full text-[13px] text-danger-600">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={message && !text.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onDone(jobId || undefined, text);
                onClose();
              } catch (e) {
                setError((e as Error).message || (message ? "Couldn't send. Try again." : "Couldn't shortlist. Try again."));
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
