"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Organization } from "@/domain/org/types";
import { companyProblem } from "@/domain/org/company";
import { hiringApi } from "@/services/hiring/client";
import { Button } from "@/components/common/Button";
import { Field, Input } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";

/**
 * An Owner's workspace settings, opened from the workspace picker: the company's name and website (what job
 * seekers see on its open jobs), and deleting the workspace, folded and confirmed by typing its name. The server
 * checks the Owner role again for both.
 */
export function WorkspaceSettings({ org, onClose, onSaved, onDeleted }: { org: Organization; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(org.name);
  const [website, setWebsite] = useState(org.website ?? "");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  // Shown in the dialog itself: a toast would sit behind it.
  const [error, setError] = useState<string | null>(null);
  const changed = name.trim() !== org.name || website.trim() !== (org.website ?? "");

  const save = async () => {
    const problem = companyProblem({ name, website });
    if (problem) return setError(problem);
    setBusy("save");
    try {
      await hiringApi.updateWorkspace(org.id, name.trim(), website.trim());
      toast.success("Company details saved", "Your open jobs show them to job seekers now.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy("delete");
    try {
      await hiringApi.deleteWorkspace(org.id, confirm);
      toast.success(`${org.name} is deleted`);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Workspace settings"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {error && (
            <p role="alert" className="mr-auto basis-full text-[13px] text-danger-600 sm:basis-auto">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={save} loading={busy === "save"} disabled={!changed || busy !== null}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Company name" htmlFor="ws-name" required>
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            maxLength={120}
          />
        </Field>
        <Field label="Website" htmlFor="ws-website" hint={org.verified ? "Changing the name or website asks WonderJobs to verify the company again." : undefined}>
          <Input
            id="ws-website"
            value={website}
            onChange={(e) => {
              setWebsite(e.target.value);
              setError(null);
            }}
            placeholder="company.com"
            maxLength={300}
          />
        </Field>
        <details className="mt-2 rounded-[12px] border border-danger-600/30 px-3 text-[13px]">
          <summary className="min-h-11 cursor-pointer py-3 font-medium text-danger-600">Delete this workspace</summary>
          <div className="flex flex-col gap-3 pb-3">
            <p className="text-ink-2">
              Removes {org.name}&apos;s jobs (from searches and career sites), their applications, the shortlist, messages, team and invitations. Everyone&apos;s own WonderJobs account stays. This can&apos;t be undone.
            </p>
            <Field label={`Type ${org.name} to confirm`} htmlFor="ws-confirm">
              <Input
                id="ws-confirm"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError(null);
                }}
                autoComplete="off"
              />
            </Field>
            <Button className="self-start" variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={remove} loading={busy === "delete"} disabled={confirm.trim() !== org.name || busy !== null}>
              Delete workspace
            </Button>
          </div>
        </details>
      </div>
    </Modal>
  );
}
