"use client";
import { useState } from "react";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { call } from "@/wonderworks/api";

/**
 * Delete one of your own posts, in every module (owner, 2026-11-03: "they should have option to delete an entry that they
 * have made"). Asks first: it goes for good, with the applications, requests or conversations on it.
 */
export function DeletePost({ module, listingId, title, onDeleted, className = "min-h-10 text-danger-600 hover:underline" }: { module: string; /** The id its Find serves: `ws_<id>`, `mk_<id>`. */ listingId: string; title: string; onDeleted: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await call(`/api/listings/${encodeURIComponent(module)}/${encodeURIComponent(listingId)}`, { method: "DELETE" });
      setOpen(false);
      toast.success("Deleted", `${title} is gone from WonderWorks.`);
      onDeleted();
    } catch (e) {
      toast.error("Couldn't delete it", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Delete
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete ${title}?`}
        description="It goes for good, with everything people sent about it (applications, requests or messages). To take it down for now, Close it instead."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              Delete
            </Button>
          </div>
        }
      >
        <span />
      </Modal>
    </>
  );
}
