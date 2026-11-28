"use client";
import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { canAddRole, roleProblem, roleSearch, type CareerRole } from "@/domain/career/roles";
import { newProfileTitle, prefilledRole } from "@/domain/career/profiles";
import { planThatAllows } from "@/domain/billing/plans";
import { usePlan } from "@/lib/usePlan";
import { PlanGate } from "@/components/billing/PlanGate";
import { getTemplate } from "@/domain/resume/templates";
import { defaultSearchQuery } from "@/services/jobs/normalize";
import { useCareerStore } from "@/store/career";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { Button } from "@/components/common/Button";
import { Input } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { formatDate } from "@/lib/format";
import { ProfileItem } from "./ProfileItem";
import { ProfileFields, type ProfileFieldsValue } from "./ProfileFields";
import { refKey, refOf, roleFieldsOf, roleInputOf } from "./profileForm";
import { editFileRoleSkills, fileRoleSkills } from "@/domain/career/roleFile";
import { useRoleFile } from "@/lib/useRoleFile";

/** The résumés a profile can use, labelled the way Resume Studio shows them. */
export function useResumeChoices() {
  const files = useResumeFilesStore((s) => s.files);
  const load = useResumeFilesStore((s) => s.load);
  const saved = useCareerStore((s) => s.savedResumes);
  useEffect(() => {
    void load();
  }, [load]);
  return [
    ...files.map((f) => ({ key: refKey({ kind: "upload", id: f.id }), label: `${f.filename} (your file)` })),
    ...saved.map((r) => ({ key: refKey({ kind: "saved", id: r.id }), label: `${r.name ?? getTemplate(r.templateId)?.name ?? "Template"} — ${r.target ? `${r.target.company}, ${r.target.title}` : r.document.header.headline || "General"} (${formatDate(r.createdAt)})` })),
  ];
}

/**
 * The candidate's roles, as profiles beside My profile (owner, 2026-11-26: "make all profile options equivalent"): each
 * opens to the same form as My profile (`ProfileFields`, edits kept in `drafts` until Save changes), renames from the
 * pencil beside its name, and has Search and Delete. Add a role starts a new profile from My profile's fields.
 */
export function RolesCard({ open, onToggle, onOpen, onSearch, drafts, setDraft, typed, setTyped, follow, choices }: { open: string | null; /** Each role's add-skill box text, by role id. */ typed: Record<string, string>; setTyped: (id: string, text: string) => void; /** Search as this profile: the page saves what's unsaved first. */ onSearch: (id: string) => void; onToggle: (id: string) => void; onOpen: (id: string) => void; drafts: Record<string, ProfileFieldsValue>; setDraft: (id: string, patch: Partial<ProfileFieldsValue>) => void; follow: ProfileFieldsValue; choices: { key: string; label: string }[] }) {
  const roles = useCareerStore((s) => s.roles ?? []);
  const dna = useCareerStore((s) => s.dna);
  const addRole = useCareerStore((s) => s.addRole);
  const updateRole = useCareerStore((s) => s.updateRole);
  const removeRole = useCareerStore((s) => s.removeRole);
  const [renaming, setRenaming] = useState<{ id: string; title: string; problem?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CareerRole | null>(null);
  const { plan, limits, plans } = usePlan();
  const atLimit = !canAddRole(roles, limits.roles);

  const rename = (role: CareerRole, title: string) => {
    // The name only: the role's other fields stay as saved (any unsaved edits stay in the form).
    const input = { ...roleInputOf(role.title, roleFieldsOf(role)), title };
    const problem = roleProblem(input, roles.filter((r) => r.id !== role.id));
    if (problem) return setRenaming({ id: role.id, title, problem });
    updateRole(role.id, input);
    setRenaming(null);
  };

  return (
    <>
      {roles.map((r) => {
        const v = drafts[r.id] ?? roleFieldsOf(r);
        const words = roleSearch({ title: r.title, query: v.searchWords, goal: v.goal }, defaultSearchQuery).query;
        return (
          <ProfileItem
            key={r.id}
            id={r.id}
            title={r.title}
            hint={words ? `Searches for “${words}”` : "Add search words"}
            open={open === r.id}
            onToggle={() => onToggle(r.id)}
            action={
              <button type="button" aria-label={`Rename ${r.title}`} onClick={() => setRenaming({ id: r.id, title: r.title })} className="inline-flex size-8 items-center justify-center rounded-full text-ink-4 hover:bg-surface-2 hover:text-ink">
                <Pencil className="size-3.5" aria-hidden />
              </button>
            }
            editor={
              renaming?.id === r.id && (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename(r, renaming.title);
                  }}
                >
                  <Input autoFocus aria-label="Profile name" value={renaming.title} maxLength={80} onChange={(e) => setRenaming({ id: r.id, title: e.target.value })} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} className="h-9 min-w-0 flex-1" />
                  <Button size="sm" type="submit">
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                  {renaming.problem && (
                    <p role="alert" className="w-full text-[12px] text-danger-600">
                      {renaming.problem}
                    </p>
                  )}
                </form>
              )
            }
          >
            <RoleFields id={r.id} value={v} onChange={(patch) => setDraft(r.id, patch)} typedSkill={typed[r.id] ?? ""} onTypedSkill={(t) => setTyped(r.id, t)} follow={follow} derivedWords={defaultSearchQuery({ headline: r.title, careerGoal: v.goal })} choices={choices} />
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="outline" icon={<Search className="size-3.5" aria-hidden />} onMouseDown={(e) => e.preventDefault() /* keep the skill box's text as typed: a chip added on blur would move this button from under the press */} onClick={() => onSearch(r.id)} aria-label={`Search as ${r.title}`}>
                Search
              </Button>
              <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" aria-hidden />} onClick={() => setConfirmDelete(r)}>
                Delete
              </Button>
            </div>
          </ProfileItem>
        );
      })}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <p className="min-w-0 flex-1 text-[12px] text-ink-3">{roles.length ? "Another kind of job you'd take?" : "Open to another kind of job? Add it as its own profile."}</p>
        <Button
          size="sm"
          variant="outline"
          icon={<Plus className="size-3.5" aria-hidden />}
          disabled={atLimit}
          onClick={() => {
            const added = addRole(prefilledRole(dna, newProfileTitle(roles)));
            if (!added) return;
            onOpen(added.id);
            setRenaming({ id: added.id, title: added.title });
          }}
        >
          Add a role
        </Button>
        {atLimit && plan !== "max" && <PlanGate className="w-full" reason={`${plans[plan].label} includes ${limits.roles} role${limits.roles === 1 ? "" : "s"}.`} needs={planThatAllows({ plans, priceRefs: { pro: {}, max: {} } }, (l) => l.roles > roles.length)} plans={plans} />}
      </div>
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this profile?"
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
                  toast.success("Profile deleted");
                }}
              >
                Delete profile
              </Button>
            </>
          )
        }
      >
        <p className="text-[14px] text-ink-2">Your past searches and the jobs they found are kept. Scheduled searches set up as this profile keep running with the words and goal they were saved with.</p>
      </Modal>
    </>
  );
}

/**
 * A role's form. With its own résumé the role's skills are that file's (owner, 2026-11-27: "Use the file's skills"):
 * shown as the file's plus any added by hand, never My profile's copied in. What's kept for the role is only what was
 * added or changed by hand; the file's own come back from the file.
 */
function RoleFields(props: React.ComponentProps<typeof ProfileFields>) {
  const { id, value, onChange, follow } = props;
  const file = useRoleFile({ id, baseResume: refOf(value.resume) });
  if (file.state === "none") return <ProfileFields {...props} />;
  const fromFile = file.state === "ready" ? file.dna.skills : [];
  const shown = fileRoleSkills(fromFile, value, follow?.skills ?? []);
  const skillsFrom = file.state === "ready" ? `from ${file.file}` : file.state === "reading" ? `reading ${file.file}…` : `couldn't read ${file.file}`;
  return (
    <ProfileFields
      {...props}
      value={{ ...value, skills: shown }}
      follow={follow && { ...follow, skills: [] }}
      skillsFrom={skillsFrom}
      onChange={(patch) => onChange(patch.skills ? { ...patch, ...editFileRoleSkills(fromFile, patch.skills, value) } : patch)}
    />
  );
}
