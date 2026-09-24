"use client";
import { useMemo, useState } from "react";
import { Check, Eye, Sparkles } from "lucide-react";
import type { ResumeDocument } from "@/domain/resume/document";
import { layoutResume } from "@/domain/resume/layout";
import type { TemplateRecommendation } from "@/domain/resume/recommend";
import { RESUME_TEMPLATES, TEMPLATE_FILTER_LABEL, type ResumeTemplate, type TemplateFilter } from "@/domain/resume/templates";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { Chip, Select } from "@/components/common/Input";
import { cn } from "@/lib/cn";
import { ResumePage } from "./ResumePage";

type Filter = "all" | "recommended" | TemplateFilter;
const FILTERS: Filter[] = ["all", "recommended", "ats", "modern", "executive", "technical", "creative", "minimal"];
const INDUSTRIES = [...new Set(RESUME_TEMPLATES.flatMap((t) => t.industries))].sort();

function Thumb({ doc, template }: { doc: ResumeDocument; template: ResumeTemplate }) {
  // The gallery thumbnail is the real renderer's first page — never a static picture (spec §30).
  const layout = useMemo(() => layoutResume(doc, template), [doc, template]);
  return <ResumePage layout={layout} page={layout.pages[0]} index={0} label={`${template.name} template preview`} className="block h-auto w-full" />;
}

export function TemplateGallery({ doc, sample, recommendation, selectedId, onUse, onPreview }: { doc: ResumeDocument; sample: boolean; recommendation: TemplateRecommendation; selectedId?: string; onUse: (t: ResumeTemplate) => void; onPreview: (t: ResumeTemplate) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [industry, setIndustry] = useState("");
  const recommended = RESUME_TEMPLATES.find((t) => t.id === recommendation.templateId)!;
  const shown = RESUME_TEMPLATES.filter((t) => (filter === "all" ? true : filter === "recommended" ? t.id === recommendation.templateId : t.filters.includes(filter)) && (!industry || t.industries.includes(industry)));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Resume builder</p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-ink sm:text-[30px]">Choose a resume template</h1>
          <p className="mt-2 max-w-2xl text-[14px] text-ink-2">Professionally designed, ATS-friendly templates. Pick a style that fits your industry and career stage — every template shows the same facts from your Career Profile, presented differently.</p>
        </div>
        <Card className="border-brand-100" aria-labelledby="wonder-recommends">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-600">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p id="wonder-recommends" className="text-[14px] font-semibold text-ink">
                Wonder recommends {recommended.name}
              </p>
              <p className="mt-1 text-[13px] text-ink-2">{recommendation.pitch}</p>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[12px] font-medium text-ink-3">Recommended because:</p>
            <ul className="mt-1 flex flex-col gap-1">
              {recommendation.reasons.map((r) => (
                <li key={r} className="flex items-start gap-1.5 text-[12px] text-ink-2">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-success-600" aria-hidden /> {r}
                </li>
              ))}
            </ul>
          </div>
          <Button full className="mt-3" onClick={() => onUse(recommended)}>
            Use this template
          </Button>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter templates">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)} className="h-9 px-3.5 text-[13px]">
            {f === "all" ? "All templates" : f === "recommended" ? "Recommended" : TEMPLATE_FILTER_LABEL[f]}
          </Chip>
        ))}
        <Select aria-label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} className="h-9 w-auto min-w-36 rounded-full text-[13px]">
          <option value="">Industry</option>
          {INDUSTRIES.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </Select>
      </div>

      {sample && (
        <p className="rounded-[12px] bg-warning-100 px-3 py-2 text-[12px] text-warning-600">
          These previews use <strong>sample content</strong> because your Career Profile has no work history yet. Add your roles under Career Profile to see your own résumé in every template.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-ink-4">No template matches these filters.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resume templates">
          {shown.map((t) => {
            const isRec = t.id === recommendation.templateId;
            const isSel = t.id === selectedId;
            return (
              <li key={t.id}>
                <article aria-label={`${t.name} template${isRec ? ", recommended" : ""}${t.filters.includes("ats") ? ", ATS friendly" : ""}`} className={cn("wj-card flex h-full flex-col overflow-hidden p-0", isSel ? "ring-2 ring-brand-500" : isRec ? "ring-2 ring-brand-200" : "")}>
                  <div className="border-b border-line bg-bg-soft px-3 pb-3 pt-2">
                    <div className="mb-2 flex h-6 items-center justify-between">
                      {isRec ? <Badge tone="brand">Recommended</Badge> : <span />}
                      {isSel && <Badge tone="success">Selected</Badge>}
                    </div>
                    <div className="aspect-[210/297] overflow-hidden rounded-[6px] bg-white shadow-sm">
                      <Thumb doc={doc} template={t} />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div>
                      <h2 className="text-[15px] font-semibold text-ink">{t.name}</h2>
                      <p className="text-[12px] text-ink-3">{t.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {t.tags.map((tag) => (
                        <Badge key={tag} className="px-2 py-0.5 text-[11px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-auto flex gap-2 pt-1">
                      <Button size="sm" className="flex-1" onClick={() => onUse(t)} aria-label={`Use the ${t.name} template`}>
                        {isSel ? "Selected" : "Use template"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onPreview(t)} icon={<Eye className="size-3.5" aria-hidden />} aria-label={`Preview the ${t.name} template`}>
                        Preview
                      </Button>
                    </div>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
