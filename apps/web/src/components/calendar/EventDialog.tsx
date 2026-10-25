"use client";
import { useMemo, useState } from "react";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { Chip, Field, Input, Segmented, Select } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";
import { useApplicationsStore } from "@/store/applications";
import { useJobsStore } from "@/store/jobs";
import { APPLICATION_STATUS_META, type ApplicationFollowUp } from "@/domain/applications/types";
import { DEFAULT_REMINDER, describeReminder, REMINDER_CHANNELS, REMINDER_LEADS, type EventReminder, type ReminderChannel } from "@/domain/calendar/reminder";

type Kind = ApplicationFollowUp["kind"];
const KINDS: { value: Kind; label: string }[] = [
  { value: "interview", label: "Interview" },
  { value: "follow_up", label: "Follow-up" },
  { value: "thank_you", label: "Thank-you" },
];
const NOTE: Record<Kind, string> = { interview: "Interview", follow_up: "Follow up with recruiter", thank_you: "Send thank-you note" };

const pad = (n: number) => String(n).padStart(2, "0");
const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** When and which ways: how long before (a select) and In app / Push / Email (chips, any of them). */
function ReminderFields({ value, onChange }: { value: EventReminder; onChange: (r: EventReminder) => void }) {
  const toggle = (c: ReminderChannel) => onChange({ ...value, channels: value.channels.includes(c) ? value.channels.filter((x) => x !== c) : [...value.channels, c] });
  return (
    <Field label="Remind me" htmlFor="ev-lead" hint={value.channels.length ? describeReminder(value) : "No reminder — pick at least one way."}>
      <Select id="ev-lead" value={value.before} onChange={(e) => onChange({ ...value, before: Number(e.target.value) })}>
        {REMINDER_LEADS.map((l) => (
          <option key={l.before} value={l.before}>
            {l.label}
          </option>
        ))}
      </Select>
      <div role="group" aria-label="Remind me by" className="mt-2 flex flex-wrap gap-1.5">
        {REMINDER_CHANNELS.map((c) => (
          <Chip key={c.id} active={value.channels.includes(c.id)} onClick={() => toggle(c.id)} className="h-9 px-3 text-[12.5px]">
            {c.label}
          </Chip>
        ))}
      </div>
    </Field>
  );
}

/**
 * Calendar → Add: an interview, follow-up or thank-you on one of the candidate's applications, on the picked day,
 * with its reminder. `editing`: an event already on the calendar — only its reminder changes here.
 */
export function EventDialog({ day, editing, onClose }: { day: Date; editing?: { applicationId: string; followUp: ApplicationFollowUp; label: string }; onClose: () => void }) {
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const addFollowUp = useApplicationsStore((s) => s.addFollowUp);
  const setReminder = useApplicationsStore((s) => s.setFollowUpReminder);
  // Applications still going (not an outcome), interviews first.
  const open = useMemo(
    () =>
      Object.values(applications)
        .filter((a) => APPLICATION_STATUS_META[a.status].group !== "outcome")
        .sort((a, b) => Number(APPLICATION_STATUS_META[b.status].group === "interview") - Number(APPLICATION_STATUS_META[a.status].group === "interview")),
    [applications],
  );
  const [kind, setKind] = useState<Kind>("interview");
  const [appId, setAppId] = useState(open.length === 1 ? open[0].id : "");
  const [date, setDate] = useState(dateInput(day));
  const [time, setTime] = useState("10:00");
  const [remind, setRemind] = useState<EventReminder>(editing?.followUp.remind ?? DEFAULT_REMINDER);
  const app = applications[appId];
  const nameOf = (id: string) => {
    const a = applications[id];
    const j = a?.job ?? (a ? jobs[a.jobId] : undefined);
    return j ? `${j.company} — ${j.title}` : "Job details unavailable";
  };

  const save = () => {
    if (editing) {
      setReminder(editing.applicationId, editing.followUp.id, remind);
      toast.success("Reminder saved", describeReminder(remind));
      return onClose();
    }
    if (!app) return;
    const dueAt = new Date(`${date}T${time || "10:00"}:00`);
    if (Number.isNaN(dueAt.getTime())) return;
    // An interview is the next round on that application.
    const note = kind === "interview" ? `Interview · round ${(app.interviewRounds ?? 0) + 1}` : NOTE[kind];
    addFollowUp(app.id, { dueAt: dueAt.toISOString(), kind, note, remind });
    toast.success(`${KINDS.find((k) => k.value === kind)!.label} added`, describeReminder(remind));
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Reminder" : "Add to calendar"}
      description={editing?.label}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!editing && !app} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!editing &&
          (open.length ? (
            <>
              <Segmented label="What" value={kind} onChange={setKind} options={KINDS} />
              <Field label="Application" htmlFor="ev-app" required>
                <Select id="ev-app" value={appId} onChange={(e) => setAppId(e.target.value)}>
                  <option value="">Choose an application…</option>
                  {open.map((a) => (
                    <option key={a.id} value={a.id}>
                      {nameOf(a.id)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" htmlFor="ev-date">
                  <Input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Time" htmlFor="ev-time">
                  <Input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </Field>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-3">No applications in progress to add an interview or follow-up to.</p>
          ))}
        {(editing || open.length > 0) && <ReminderFields value={remind} onChange={setRemind} />}
      </div>
    </Modal>
  );
}
