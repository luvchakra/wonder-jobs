"use client";
import { useEffect, useState } from "react";
import { CAPABILITY_META } from "@/domain/automation/policy";
import { ID_KINDS, ID_LABEL, SENSITIVE_GROUPS, type IdKind, type SensitiveAnswers, type SensitiveGroup } from "@/domain/jobs-apply/sensitive";
import { useAutomationStore } from "@/store/automation";
import { Fold } from "@/components/common/Fold";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { Field, Input, Select, Switch } from "@/components/common/Input";
import { toast } from "@/components/feedback/Toast";

const TITLE: Record<SensitiveGroup, string> = {
  fill_demographics: "Gender, ethnicity, veteran and disability",
  fill_work_authorization: "Right to work and sponsorship",
  fill_declarations: "Legal declarations and consent boxes",
  fill_government_ids: "ID numbers",
};

interface Saved {
  answers: SensitiveAnswers;
  ids: Partial<Record<IdKind, string>>;
}

/**
 * Sensitive questions on employer forms. Each group is off until the candidate turns it on here, and turning
 * one on means confirming the exact answers Wonder will use — nothing is ever guessed. Turning off is instant.
 */
export function SensitiveQuestions() {
  const policy = useAutomationStore((s) => s.policy);
  const setCapability = useAutomationStore((s) => s.setCapability);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [editing, setEditing] = useState<SensitiveGroup | null>(null);

  useEffect(() => {
    fetch("/api/sensitive", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Saved>) : null))
      .then((d) => setSaved(d ?? { answers: {}, ids: {} }))
      .catch(() => setSaved({ answers: {}, ids: {} }));
  }, []);

  const on = SENSITIVE_GROUPS.filter((g) => policy[g] === "automatic").length;
  return (
    <Fold title="Sensitive questions" hint={on ? `${on} of 4 answered by Wonder, with your saved answers` : "Left for you on every form. Turn on to let Wonder answer with your saved answers."} className="mb-4">
      <ul className="divide-y divide-line">
        {SENSITIVE_GROUPS.map((g) => (
          <li key={g} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-ink">{TITLE[g]}</span>
              {policy[g] === "automatic" && (
                <button type="button" className="text-[12px] text-brand-600 hover:underline" onClick={() => setEditing(g)}>
                  Edit answers
                </button>
              )}
            </span>
            <Switch label={TITLE[g]} checked={policy[g] === "automatic"} disabled={!saved} onChange={(v) => (v ? setEditing(g) : setCapability(g, "off"))} />
          </li>
        ))}
      </ul>
      {editing && saved && (
        <ConfirmGroup
          group={editing}
          saved={saved}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setSaved(next);
            setCapability(editing, "automatic");
            setEditing(null);
            toast.success("Saved — Wonder will answer these with your answers");
          }}
        />
      )}
    </Fold>
  );
}

function ConfirmGroup({ group, saved, onClose, onSaved }: { group: SensitiveGroup; saved: Saved; onClose: () => void; onSaved: (s: Saved) => void }) {
  const [a, setA] = useState<SensitiveAnswers>(saved.answers);
  const [countries, setCountries] = useState((saved.answers.authorizedCountries ?? []).join(", "));
  const [ids, setIds] = useState<Partial<Record<IdKind, string>>>({});
  const [busy, setBusy] = useState(false);
  const text = (k: "gender" | "pronouns" | "ethnicity" | "veteran" | "disability", label: string, placeholder: string) => (
    <Field label={label} htmlFor={`wj-s-${k}`}>
      <Input id={`wj-s-${k}`} value={a[k] ?? ""} placeholder={placeholder} onChange={(e) => setA({ ...a, [k]: e.target.value })} />
    </Field>
  );

  const answers: SensitiveAnswers = { ...a, authorizedCountries: countries.split(",").map((c) => c.trim()).filter(Boolean) };
  const newIds = Object.fromEntries(Object.entries(ids).filter(([, v]) => v?.trim())) as Partial<Record<IdKind, string>>;
  // Confirming needs at least one answer for this group — an empty opt-in would only ever leave fields blank.
  const ready =
    group === "fill_demographics" ? [a.gender, a.pronouns, a.ethnicity, a.veteran, a.disability].some((v) => v?.trim())
    : group === "fill_work_authorization" ? !!answers.authorizedCountries?.length
    : group === "fill_declarations" ? !!a.criminalRecord || a.agreeDeclarations === true
    : Object.keys(newIds).length > 0 || Object.keys(saved.ids).length > 0;

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch("/api/sensitive", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers, ids: newIds }) });
      if (!res.ok) throw new Error();
      onSaved((await res.json()) as Saved);
    } catch {
      toast.error("Couldn't save — nothing was turned on");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={TITLE[group]}
      description={`${CAPABILITY_META[group].description.replace(/ Off unless you turn it on\.$/, "")} Wonder fills these only with what you enter here; anything blank stays for you.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={busy} disabled={!ready || busy}>
            Let Wonder answer these
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {group === "fill_demographics" && (
          <>
            {text("gender", "Gender", "e.g. Male, Female, Prefer not to say")}
            {text("pronouns", "Pronouns", "e.g. he/him")}
            {text("ethnicity", "Race / ethnicity", "e.g. Asian, Prefer not to say")}
            {text("veteran", "Veteran status", "e.g. I am not a protected veteran")}
            {text("disability", "Disability", "e.g. No, Prefer not to say")}
          </>
        )}
        {group === "fill_work_authorization" && (
          <Field label="Countries you can work in without sponsorship" hint="Comma-separated. Wonder answers “authorized?” Yes and “need sponsorship?” No for these, and the opposite elsewhere." htmlFor="wj-s-countries">
            <Input id="wj-s-countries" value={countries} placeholder="e.g. India" onChange={(e) => setCountries(e.target.value)} />
          </Field>
        )}
        {group === "fill_declarations" && (
          <>
            <Field label="Have you ever been convicted of a crime?" htmlFor="wj-s-criminal">
              <Select id="wj-s-criminal" value={a.criminalRecord ?? ""} onChange={(e) => setA({ ...a, criminalRecord: e.target.value || undefined })}>
                <option value="">Leave for me</option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </Select>
            </Field>
            <label className="flex items-start gap-2 text-[13px] text-ink-2">
              <input type="checkbox" className="mt-0.5" checked={a.agreeDeclarations === true} onChange={(e) => setA({ ...a, agreeDeclarations: e.target.checked })} />
              Tick the form&apos;s declaration, terms and consent boxes for me. Never a signature.
            </label>
          </>
        )}
        {group === "fill_government_ids" && (
          <>
            <p className="text-[12px] text-ink-3">Stored encrypted; only the last 4 digits are ever shown. Leave a box blank to keep what&apos;s saved.</p>
            {ID_KINDS.map((k) => (
              <Field key={k} label={ID_LABEL[k]} htmlFor={`wj-s-${k}`}>
                <Input id={`wj-s-${k}`} autoComplete="off" value={ids[k] ?? ""} placeholder={saved.ids[k] ?? "Not saved"} onChange={(e) => setIds({ ...ids, [k]: e.target.value })} />
              </Field>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}
