"use client";
import { useEffect, useRef, useState } from "react";
import { Download, FileUp, Star, Trash2, UserRoundPen } from "lucide-react";
import { formatBytes, isPdf, type UploadedResume } from "@/domain/resume/files";
import { useResumeFilesStore } from "@/store/resumeFiles";
import { useCareerStore } from "@/store/career";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { toast } from "@/components/feedback/Toast";
import { downloadBlob } from "@/lib/download";
import { formatDate } from "@/lib/format";

/**
 * "Your résumé files": the candidate's own PDF / Word résumés. Uploading checks the file by its bytes on
 * the server and stores it encrypted; the base résumé is whichever one the candidate marks — never
 * picked for them. Applying attaches the file exactly as uploaded.
 */
export function ResumeFiles() {
  const { files, status, load, upload, remove } = useResumeFilesStore();
  const base = useCareerStore((s) => s.baseResume);
  const setBase = useCareerStore((s) => s.setBaseResume);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UploadedResume | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === "demo") {
    return (
      <section aria-labelledby="resume-files" className="rounded-[16px] border border-dashed border-line p-4">
        <h2 id="resume-files" className="text-[17px] font-semibold text-ink">
          Your résumé files
        </h2>
        <p className="mt-1 text-[13px] text-ink-3">Uploading your own résumé isn&apos;t part of the demo — it&apos;s stored with your account. Create an account to upload one and use it when you apply.</p>
      </section>
    );
  }

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy("upload");
    try {
      const meta = await upload(file);
      const firstOne = !base;
      if (firstOne) setBase({ kind: "upload", id: meta.id });
      toast.success("Résumé uploaded", firstOne ? "It's your base résumé — Wonder offers it first when you apply." : "Set it as your base résumé to have it offered first when you apply.");
    } catch (e) {
      toast.error("Upload didn't work", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const download = async (f: UploadedResume) => {
    setBusy(`dl-${f.id}`);
    try {
      const res = await fetch(`/api/resume-files/${encodeURIComponent(f.id)}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      downloadBlob(await res.blob(), f.filename);
    } catch {
      toast.error("The download didn't work", "Try again.");
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async (f: UploadedResume) => {
    setBusy(`rm-${f.id}`);
    try {
      await remove(f.id);
      const wasBase = base?.kind === "upload" && base.id === f.id;
      if (wasBase) setBase(undefined);
      toast.success("File deleted", wasBase ? "It was your base résumé — choose another as your base." : undefined);
      setConfirmDelete(null);
    } catch (e) {
      toast.error("Couldn't delete it", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const isBase = (f: UploadedResume) => base?.kind === "upload" && base.id === f.id;
  const sorted = [...files].sort((a, b) => Number(isBase(b)) - Number(isBase(a)));

  return (
    <section aria-labelledby="resume-files">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="resume-files" className="text-[17px] font-semibold text-ink">
            Your résumé files
          </h2>
          <p className="text-[13px] text-ink-3">The résumé you already use, as a PDF or Word file (up to 3 MB). It&apos;s stored encrypted and attached to applications exactly as you uploaded it.</p>
        </div>
        <input ref={input} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" aria-label="Choose a résumé file" onChange={(e) => onPick(e.target.files?.[0])} />
        <Button size="sm" icon={<FileUp className="size-4" aria-hidden />} loading={busy === "upload"} disabled={files.length >= 5} onClick={() => input.current?.click()}>
          Upload résumé
        </Button>
      </div>
      {status === "error" && (
        <p className="mb-3 text-[13px] text-danger-600" role="alert">
          Your files couldn&apos;t be loaded just now.{" "}
          <button type="button" className="underline" onClick={() => load(true)}>
            Try again
          </button>
        </p>
      )}
      {files.length >= 5 && <p className="mb-3 text-[12px] text-ink-3">You can keep up to 5 files. Delete one to upload another.</p>}
      {status === "ready" && files.length === 0 ? (
        <button type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center gap-1 rounded-[16px] border border-dashed border-line px-4 py-6 text-center hover:border-brand-300">
          <FileUp className="size-5 text-brand-600" aria-hidden />
          <span className="text-[14px] font-medium text-ink">Upload the résumé you already use</span>
          <span className="text-[12px] text-ink-3">PDF or Word (.docx). It becomes your base résumé, offered first when you apply.</span>
        </button>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sorted.map((f) => (
            <li key={f.id} className={`wj-card flex flex-col gap-2 p-4 ${isBase(f) ? "ring-2 ring-brand-300" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-ink" title={f.filename}>
                    {f.filename}
                  </p>
                  <p className="text-[12px] text-ink-4">
                    {isPdf(f) ? "PDF" : "Word"} · {formatBytes(f.sizeBytes)} · uploaded {formatDate(f.uploadedAt)}
                  </p>
                </div>
                {isBase(f) && (
                  <Badge tone="brand" icon={<Star className="size-3" aria-hidden />}>
                    Base
                  </Badge>
                )}
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {!isBase(f) && (
                  <Button size="sm" variant="outline" icon={<Star className="size-3.5" aria-hidden />} onClick={() => setBase({ kind: "upload", id: f.id })}>
                    Set as base
                  </Button>
                )}
                <Button size="sm" variant="outline" icon={<UserRoundPen className="size-3.5" aria-hidden />} href={`/app/career-dna?fill=${encodeURIComponent(f.id)}`} aria-label={`Fill Career Profile from ${f.filename}`}>
                  Fill Career Profile
                </Button>
                <Button size="sm" variant="outline" icon={<Download className="size-3.5" aria-hidden />} loading={busy === `dl-${f.id}`} onClick={() => download(f)}>
                  Download
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" aria-hidden />} aria-label={`Delete ${f.filename}`} onClick={() => setConfirmDelete(f)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this file?"
        description={confirmDelete?.filename}
        size="sm"
        footer={
          confirmDelete && (
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Keep it
              </Button>
              <Button variant="danger" loading={busy === `rm-${confirmDelete.id}`} onClick={() => doDelete(confirmDelete)}>
                Delete file
              </Button>
            </>
          )
        }
      >
        <p className="text-[14px] text-ink-2">It&apos;s deleted from WonderJobs straight away. Applications you already sent are unaffected; any application you&apos;re still preparing with it will ask you to choose another résumé.</p>
      </Modal>
    </section>
  );
}
