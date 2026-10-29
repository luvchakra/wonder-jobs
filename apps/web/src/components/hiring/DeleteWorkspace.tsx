"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Organization } from "@/domain/org/types";
import { hiringApi } from "@/services/hiring/client";
import { Button } from "@/components/common/Button";
import { Field, Input } from "@/components/common/Input";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";

/** Deleting a workspace, confirmed by typing its name; the server checks the Owner role and the name again. */
export function DeleteWorkspace({ org, onClose, onDeleted }: { org: Organization; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    try {
      await hiringApi.deleteWorkspace(org.id, confirm);
      toast.success(`${org.name} is deleted`);
      onDeleted();
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
      title={`Delete ${org.name}?`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {error && (
            <p role="alert" className="mr-auto basis-full text-[13px] text-danger-600 sm:basis-auto">
              {error}
            </p>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={remove} loading={busy} disabled={confirm.trim() !== org.name || busy}>
            Delete workspace
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-[14px]">
        <p className="text-ink-2">
          This removes {org.name}&apos;s jobs (from searches and career sites), their applications, career sites, the shortlist, messages, team and invitations. Everyone&apos;s own WonderWorks account stays. It can&apos;t be undone.
        </p>
        <Field label={`Type ${org.name} to confirm`} htmlFor="dw-confirm">
          <Input
            id="dw-confirm"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
            }}
            autoComplete="off"
          />
        </Field>
      </div>
    </Modal>
  );
}
