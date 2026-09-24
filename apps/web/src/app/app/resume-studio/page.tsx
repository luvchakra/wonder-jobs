"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Eye, FileText, Trash2 } from "lucide-react";
import { useApplicationsStore } from "@/store/applications";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { historyOf } from "@/domain/career/history";
import { buildResumeDocument, type TargetJob } from "@/domain/resume/document";
import { SPARSE_FIXTURE, ATS_FIXTURE } from "@/domain/resume/fixtures";
import { layoutResume } from "@/domain/resume/layout";
import { recommendTemplate } from "@/domain/resume/recommend";
import { getTemplate, type ResumeTemplate } from "@/domain/resume/templates";
import type { SavedResume } from "@/domain/resume/saved";
import { PROVENANCE_META } from "@/domain/workflow/resolve";
import { renderSaved } from "@/services/resume/generate";
import { downloadDocx, downloadPdf } from "@/services/resume/download";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Modal } from "@/components/common/Modal";
import { EmptyState } from "@/components/common/States";
import { Tabs } from "@/components/common/Tabs";
import { toast } from "@/components/feedback/Toast";
import { GeneratePanel } from "@/components/resume/GeneratePanel";
import { ResumeFonts } from "@/components/resume/ResumePage";
import { ResumeViewer } from "@/components/resume/ResumeViewer";
import { TemplateGallery } from "@/components/resume/TemplateGallery";
import { formatDate } from "@/lib/format";

type Tab = "templates" | "mine";

export default function ResumeStudioPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = params.get("tab") === "mine" ? "mine" : "templates";
  const setTab = (t: Tab) => router.replace(t === "mine" ? "/app/resume-studio?tab=mine" : `/app/resume-studio${params.get("job") ? `?job=${params.get("job")}${params.get("app") ? `&app=${params.get("app")}` : ""}` : ""}`);
  return (
    <div>
      <ResumeFonts />
      <Tabs value={tab} onChange={setTab} label="Resume" items={[{ value: "templates", label: "Templates" }, { value: "mine", label: "My resumes" }]} className="mb-5" variant="underline" />
      {tab === "templates" ? <Templates /> : <MyResumes />}
    </div>
  );
}

function Templates() {
  const params = useSearchParams();
  const dna = useCareerStore((s) => s.dna);
  const selectedId = useCareerStore((s) => s.resumeTemplateId);
  const setTemplate = useCareerStore((s) => s.setResumeTemplate);
  const saved = useCareerStore((s) => s.savedResumes);
  const jobs = useJobsStore((s) => s.jobs);
  const [preview, setPreview] = useState<ResumeTemplate | null>(null);
  const [confirmChange, setConfirmChange] = useState<ResumeTemplate | null>(null);
  const [showPanel, setShowPanel] = useState(!!selectedId);
  const panelRef = useRef<HTMLDivElement>(null);

  const job = params.get("job") ? jobs[params.get("job")!] : undefined;
  const target: TargetJob | undefined = useMemo(() => (job ? { id: job.id, title: job.title, company: job.company, description: job.description, skills: job.skills } : undefined), [job]);
  const applicationId = params.get("app") ?? undefined;

  const h = historyOf(dna);
  const ready = !!dna.name.trim() && h.experience.length > 0;
  // With no work history yet, gallery thumbnails show clearly-labelled sample content instead of an empty page.
  const doc = useMemo(() => buildResumeDocument(ready ? dna : ATS_FIXTURE, { target: ready ? target : undefined }), [dna, ready, target]);
  const recommendation = useMemo(() => recommendTemplate(ready ? dna : { ...SPARSE_FIXTURE, ...dna }), [dna, ready]);
  const selected = selectedId ? getTemplate(selectedId) : undefined;

  const use = (t: ResumeTemplate) => {
    setPreview(null);
    // Changing an existing choice after résumés were made: confirm it's presentation only (spec §32).
    if (selectedId && selectedId !== t.id && saved.length) return setConfirmChange(t);
    commit(t);
  };
  const commit = (t: ResumeTemplate) => {
    setTemplate(t.id);
    setConfirmChange(null);
    setShowPanel(true);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="flex flex-col gap-5">
      {target && (
        <p className="rounded-[12px] bg-brand-50 px-3 py-2 text-[13px] text-brand-700">
          Preparing a résumé for <strong>{target.title}</strong> at <strong>{target.company}</strong>. Wonder orders your own experience and skills by relevance to this role — it never adds anything.
        </p>
      )}
      {!ready && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-surface p-4">
          <p className="text-[13px] text-ink-2">
            <strong className="text-ink">Add your work history to build your résumé.</strong> Templates render only what&apos;s in your Career Profile — your roles, education and contact details.
          </p>
          <Button size="sm" href="/app/career-dna">
            Add work history
          </Button>
        </div>
      )}

      {selected && showPanel && (
        <div ref={panelRef} className="scroll-mt-20">
          <GeneratePanel key={`${selected.id}-${target?.id ?? ""}`} dna={dna} template={selected} target={target} applicationId={applicationId} onChooseAnother={() => setShowPanel(false)} />
        </div>
      )}

      <TemplateGallery doc={doc} sample={!ready} recommendation={recommendation} selectedId={selectedId} onUse={use} onPreview={setPreview} />

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? `${preview.name} template` : ""} description={ready ? "Your Career Profile in this template." : "Sample content — add your work history to see your own."} size="lg" footer={preview && (
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => setPreview(null)}>
            Change template
          </Button>
          <Button onClick={() => use(preview)}>Use this template</Button>
        </div>
      )}>
        {preview && <ResumeViewer layout={layoutResume(doc, preview)} title={`${preview.name} v${preview.version}`} />}
      </Modal>

      <Modal open={!!confirmChange} onClose={() => setConfirmChange(null)} title="Change template?" size="sm" footer={confirmChange && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmChange(null)}>
            Cancel
          </Button>
          <Button onClick={() => commit(confirmChange)}>Change template</Button>
        </div>
      )}>
        <p className="text-[14px] text-ink-2">Your content will remain unchanged. Only the presentation will change. Résumés you already generated keep their original template.</p>
      </Modal>
    </div>
  );
}

function MyResumes() {
  const savedResumes = useCareerStore((s) => s.savedResumes);
  const deleteResume = useCareerStore((s) => s.deleteResume);
  const applications = useApplicationsStore((s) => s.applications);
  const jobs = useJobsStore((s) => s.jobs);
  const [open, setOpen] = useState<SavedResume | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const drafts = Object.values(applications)
    .flatMap((a) => a.artifacts.filter((x) => x.type === "resume").map((x) => ({ app: a, artifact: x })))
    .sort((a, b) => b.artifact.versions[b.artifact.versions.length - 1].createdAt.localeCompare(a.artifact.versions[a.artifact.versions.length - 1].createdAt));
  const openRender = open ? renderSaved(open.document, open.templateId) : null;

  const download = async (r: SavedResume, kind: "pdf" | "docx") => {
    const g = renderSaved(r.document, r.templateId);
    if (!g) return toast.error("This template version is no longer available");
    setBusy(`${r.id}-${kind}`);
    try {
      if (kind === "pdf") await downloadPdf(g);
      else downloadDocx(g);
    } catch {
      toast.error("The download didn't work", "Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="my-resumes">
        <h1 id="my-resumes" className="mb-1 text-[22px] font-semibold tracking-tight text-ink">
          My resumes
        </h1>
        <p className="mb-4 text-[13px] text-ink-3">Every résumé you generated, kept exactly as it was made — the same content and the same template version, even if your profile or the template changes later.</p>
        {savedResumes.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" aria-hidden />} title="No résumés generated yet" body="Choose a template and generate one — it's saved here automatically." action={{ label: "Choose a template", href: "/app/resume-studio" }} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {savedResumes.map((r) => {
              const t = getTemplate(r.templateId);
              return (
                <li key={r.id} className="wj-card flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-ink">{t?.name ?? r.templateId}</p>
                      <p className="truncate text-[13px] text-ink-3">{r.target ? `${r.target.company} — ${r.target.title}` : r.document.header.headline || "General résumé"}</p>
                    </div>
                    <Badge>v{r.templateVersion}</Badge>
                  </div>
                  <p className="text-[12px] text-ink-4">
                    Created {formatDate(r.createdAt)} · {r.pageCount} page{r.pageCount === 1 ? "" : "s"}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" icon={<Eye className="size-3.5" aria-hidden />} onClick={() => setOpen(r)}>
                      Preview
                    </Button>
                    <Button size="sm" variant="outline" icon={<Download className="size-3.5" aria-hidden />} loading={busy === `${r.id}-pdf`} onClick={() => download(r, "pdf")}>
                      PDF
                    </Button>
                    <Button size="sm" variant="outline" icon={<Download className="size-3.5" aria-hidden />} loading={busy === `${r.id}-docx`} onClick={() => download(r, "docx")}>
                      DOCX
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" aria-hidden />} aria-label={`Delete the ${t?.name ?? ""} résumé from ${formatDate(r.createdAt)}`} onClick={() => deleteResume(r.id)}>
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${getTemplate(open.templateId)?.name ?? ""} résumé` : ""} description={open ? `Created ${formatDate(open.createdAt)}` : undefined} size="lg">
        {openRender && <ResumeViewer layout={openRender.layout} title={`${openRender.template.name} v${openRender.template.version}`} />}
      </Modal>

      <section aria-labelledby="tailored-drafts">
        <h2 id="tailored-drafts" className="mb-1 text-[17px] font-semibold text-ink">
          Tailored drafts from applications
        </h2>
        <p className="mb-3 text-[13px] text-ink-3">Résumé text Wonder drafted for specific applications, with full version history. Edit any of them from its application.</p>
        {drafts.length === 0 ? (
          <p className="text-[13px] text-ink-4">None yet — preparing an application drafts one.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {drafts.map(({ app, artifact }) => {
              const job = jobs[app.jobId];
              const cur = artifact.versions.find((v) => v.id === artifact.currentVersionId) ?? artifact.versions[0];
              return (
                <li key={artifact.id}>
                  <Link href={`/app/applications/${app.id}/prepare`} className="wj-card wj-elevate flex h-full flex-col p-4">
                    <span className="text-[14px] font-semibold text-ink">{job?.title ?? "Role"}</span>
                    <span className="text-[13px] text-ink-3">{job?.company}</span>
                    <p className="mt-3 line-clamp-4 whitespace-pre-line text-[12px] text-ink-3">{cur.content}</p>
                    <span className="mt-3 flex items-center gap-2 text-[11px] text-ink-4">
                      <Badge tone={PROVENANCE_META[cur.provenance].tone}>{PROVENANCE_META[cur.provenance].label}</Badge>
                      {artifact.versions.length} version{artifact.versions.length === 1 ? "" : "s"} · {formatDate(cur.createdAt)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
