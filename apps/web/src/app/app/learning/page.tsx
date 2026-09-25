"use client";
import { BookOpen, ArrowRight } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/common/Card";
import { Badge } from "@/components/common/Badge";
import Link from "next/link";

/** Learning suggestions derived from the gap between strong-match roles and your Career DNA. No external catalog is connected yet. */
export default function LearningPage() {
  const dna = useCareerStore((s) => s.dna);
  const matches = useJobsStore((s) => s.matches);
  const jobs = useJobsStore((s) => s.jobs);
  const mine = new Set(dna.skills.map((s) => s.name.toLowerCase()));
  const gap = new Map<string, number>();
  for (const m of Object.values(matches)) {
    if (m.fit !== "strong" && m.fit !== "worth_considering") continue;
    for (const s of jobs[m.jobId]?.skills ?? []) if (!mine.has(s.toLowerCase())) gap.set(s, (gap.get(s) ?? 0) + 1);
  }
  const top = [...gap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <div>
      <PageHeader title="Learning" description="Skills that show up in roles you match well with but aren't in your Career Profile yet. Close the gap, or add the skill if you already have it." />
      {top.length === 0 ? (
        <Card className="text-center">
          <BookOpen className="mx-auto size-6 text-brand-600" aria-hidden />
          <p className="mt-2 text-[15px] font-semibold text-ink">No gaps found</p>
          <p className="text-[13px] text-ink-3">Your Career Profile already covers the skills in your strongest matches.</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {top.map(([skill, n]) => (
            <li key={skill}>
              <Card className="flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <p className="text-[15px] font-semibold text-ink">{skill}</p>
                  <Badge tone="brand">{n} roles</Badge>
                </div>
                <p className="mt-2 flex-1 text-[13px] text-ink-3">Appears in {n} of your well-matched roles. Adding evidence of {skill} would strengthen those applications.</p>
                <div className="mt-4 flex items-center justify-between text-[13px]">
                  <Link href="/app/career-dna" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                    I have this skill <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                  <span className="text-ink-4">Courses: not available yet</span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
