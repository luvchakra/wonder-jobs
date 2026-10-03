"use client";
import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { canAddRole, MAX_ROLES, roleProblem, roleSearch, type CareerRole, type RoleInput } from "@/domain/career/roles";
import type { BaseResumeRef } from "@/domain/resume/files";
import { getTemplate } from "@/domain/resume/templates";
import { defaultSearchQuery } from "@/services/jobs/normalize";
import { useCareerStore } from "@/store/career";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Field, Input, Select, Textarea } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { formatDate } from "@/lib/format";

const refKey = (r?: BaseResumeRef) => (r ? `${r.kind}:${r.id}` : "");
const refOf = (k: string): BaseResumeRef | undefined => {
  const [kind, id] = k.split(":");
  return (kind === "upload" || kind === "saved") && id ? { kind, id } : undefined;
};

/** The résumés a role can use, labelled the way Resume Studio shows them. */
function useResumeChoices() {
  const files = useResumeFilesStore((s) => s.files);
  const load = useResumeFilesStore((s) => s.load);
  const saved = useCareerStore((s) => s.savedResumes);
  useEffect(() => {
    void load();
  }, [load]);
  return [
    ...files.map((f) => ({ key: refKey({ kind: "upload", id: f.id }), label: `${f.filename} (your file)` })),
    ...saved.map((r) => ({ key: refKey({ kind: "saved", id: r.id }), label: `${getTemplate(r.templateId)?.name ?? "Template"} — ${r.target ? `${r.target.company}, ${r.target.title}` : r.document.header.headline || "General"} (${formatDate(r.createdAt)})` })),
  ];
}

/**
 * Career Profile → Roles: the different jobs the candidate is open to, each a way to search with its own
 * terms, goal and résumé. Saved straight away (they're not part of the profile form above), and used only
 * when the candidate picks one under "Search as".
 */
export function RolesCard() {
  const roles = useCareerStore((s) => s.roles ?? []);
  const addRole = useCareerStore((s) => s.addRole);
  const updateRole = useCareerStore((s) => s.updateRole);
  const removeRole = useCareerStore((s) => s.removeRole);
  const choices = useResumeChoices();
  const [editing, setEditing] = useState<CareerRole | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CareerRole | null>(null);
  const label = (r: CareerRole) => (r.baseResume ? (choices.find((c) => c.key === refKey(r.baseResume))?.label ?? "A résumé that was deleted — choose another") : "Your base résumé");

  return (
    <Card aria-labelledby="roles-title">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="roles-title" className="text-[15px] font-semibold text-ink">
          Roles you&apos;re open to
        </h2>
        <Button size="sm" variant="outline" icon={<Plus className="size-3.5" aria-hidden />} disabled={!canAddRole(roles)} onClick={() => setEditing("new")}>
          Add a role
        </Button>
      </div>
      <p className="mb-3 text-[12px] text-ink-3">
        Open to more than one kind of job — say, roles you&apos;ve held before? Add each as a role with its own search terms, goal and résumé, then choose it under &ldquo;Search as&rdquo; when you search. Matching still uses your whole Career Profile. Up to {MAX_ROLES}.
      </p>
      {roles.length === 0 ? (
        <p className="text-[13px] text-ink-4">No roles yet — searches use your Career Profile.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {roles.map((r) => {
            const search = roleSearch(r, defaultSearchQuery);
            return (
              <li key={r.id} className="rounded-[14px] border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-ink">{r.title}</p>
                    <p className="text-[12px] text-ink-3">Searches for {search.query ? `“${search.query}”` : "— add search terms"} · goal: {search.careerGoal}</p>
                    <p className="text-[12px] text-ink-4">Résumé: {label(r)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" icon={<Search className="size-3.5" aria-hidden />} href={`/app/runs/new?role=${encodeURIComponent(r.id)}`} aria-label={`Search as ${r.title}`}>
                      Search
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" aria-hidden />} aria-label={`Edit ${r.title}`} onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" aria-hidden />} aria-label={`Delete ${r.title}`} onClick={() => setConfirmDelete(r)} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <RoleEditor
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? undefined : editing}
          others={roles.filter((r) => editing === "new" || r.id !== editing.id)}
          choices={choices}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            if (editing === "new") addRole(input);
            else updateRole(editing.id, input);
            toast.success(editing === "new" ? "Role added" : "Role updated", "Choose it under “Search as” when you search.");
            setEditing(null);
          }}
        />
      )}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this role?"
        description={confirmDelete?.title}
        size="sm"
        footer={
          confirmDelete && (
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Keep it
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  removeRole(confirmDelete.id);
                  setConfirmDelete(null);
                  toast.success("Role deleted");
                }}
              >
                Delete role
              </Button>
            </>
          )
        }
      >
        <p className="text-[14px] text-ink-2">Your past searches and the jobs they found are kept. Scheduled searches set up as this role keep running with the terms and goal they were saved with.</p>
      </Modal>
    </Card>
  );
}

function RoleEditor({ initial, others, choices, onClose, onSave }: { initial?: CareerRole; others: CareerRole[]; choices: { key: string; label: string }[]; onClose: () => void; onSave: (input: RoleInput) => void }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [query, setQuery] = useState(initial?.query ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [resume, setResume] = useState(refKey(initial?.baseResume));
  const [tried, setTried] = useState(false);
  const input: RoleInput = { title, query, goal, baseResume: refOf(resume) };
  const problem = roleProblem(input, others);
  const derived = defaultSearchQuery({ headline: title, careerGoal: goal });
  const save = () => {
    setTried(true);
    if (!problem) onSave(input);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Edit role" : "Add a role"}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{initial ? "Save role" : "Add role"}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Role" htmlFor="role-title" required hint="What you'd call it, e.g. “Data Analyst”.">
          <Input id="role-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus />
        </Field>
        <Field label="Search terms" htmlFor="role-query" hint={query.trim() ? "Sent to job sources as written." : derived ? `Optional. Leave empty to search for “${derived}”, read from the role and goal.` : "Optional. Leave empty to use terms read from the role name."}>
          <Input id="role-query" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={120} placeholder="e.g. data analyst OR business analyst" />
        </Field>
        <Field label="Goal for this role" htmlFor="role-goal" hint="Optional. What fit is scored against when you search as this role; empty uses the role name. Your Career Profile's goal is unchanged.">
          <Textarea id="role-goal" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={300} className="min-h-20" placeholder="e.g. Senior data analyst roles in fintech" />
        </Field>
        <Field label="Résumé for this role" htmlFor="role-resume" hint="Offered first when you apply to jobs this role's searches found.">
          <Select id="role-resume" value={resume} onChange={(e) => setResume(e.target.value)}>
            <option value="">Your base résumé</option>
            {choices.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        {tried && problem && (
          <p role="alert" className="text-[13px] text-danger-600">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
