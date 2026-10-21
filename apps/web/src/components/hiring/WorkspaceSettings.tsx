"use client";
import { useState } from "react";
import type { Organization } from "@/domain/org/types";
import { companyProblem } from "@/domain/org/company";
import { hiringApi } from "@/services/hiring/client";
import { Button } from "@/components/common/Button";
import { Field, Input } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";

/**
 * An Owner edits the company's name and website (what job seekers see on its open jobs), from the workspaces
 * table or the verification dialog. The server checks the Owner role again.
 */
export function WorkspaceSettings({ org, onClose, onSaved }: { org: Organization; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(org.name);
  const [website, setWebsite] = useState(org.website ?? "");
  const [busy, setBusy] = useState(false);
  // Shown in the dialog itself: a toast would sit behind it.
  const [error, setError] = useState<string | null>(null);
  const changed = name.trim() !== org.name || website.trim() !== (org.website ?? "");

  const save = async () => {
    const problem = companyProblem({ name, website });
    if (problem) return setError(problem);
    setBusy(true);
    try {
      await hiringApi.updateWorkspace(org.id, name.trim(), website.trim());
      toast.success("Company details saved", "Your open jobs show them to job seekers now.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${org.name}`}
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
          <Button onClick={save} loading={busy} disabled={!changed || busy}>
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
      </div>
    </Modal>
  );
}
