"use client";
import { Search } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { selectActiveRun, useWorkflowStore } from "@/store/workflow";
import { greeting } from "@/lib/format";
import { useHomeAttention } from "@/lib/useHomeAttention";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { UpcomingList } from "@/components/career/UpcomingList";
import { CareerInsightCard } from "@/components/career/CareerInsightCard";
import { AIProviderCard } from "@/components/ai/AIProviderCard";
import { ActiveRunCard } from "@/components/workflow/ActiveRunCard";
import { HomeAttentionSections } from "@/components/career/HomeAttentionSections";
import { MobileHome } from "@/components/career/MobileHome";
import { ProgressAndWatch } from "@/components/career/ProgressAndWatch";
import { useAutomationStore } from "@/store/automation";
import Link from "next/link";

/**
 * Home answers one question — "what deserves my attention today?" — not a feature-dump
 * dashboard. `useHomeAttention` computes real opportunities/applications/career actions/Wonder
 * activity once; this page and `MobileHome` only render it.
 */
export default function HomePage() {
  const dna = useCareerStore((s) => s.dna);
  const upcoming = useCareerStore((s) => s.upcoming);
  const insights = useCareerStore((s) => s.insights);
  const jobs = useJobsStore((s) => s.jobs);
  const matches = useJobsStore((s) => s.matches);
  const quality = useJobsStore((s) => s.quality);
  const saved = useJobsStore((s) => s.saved);
  const save = useJobsStore((s) => s.save);
  const unsave = useJobsStore((s) => s.unsave);
  const activeRun = useWorkflowStore(selectActiveRun);
  const defaultLevel = useAutomationStore((s) => s.defaultLevel);
  const firstName = dna.name.split(" ")[0];
  const attention = useHomeAttention();

  return (
    <>
      <div className="md:hidden">
        <MobileHome name={dna.name} level={defaultLevel} activeRun={activeRun} attention={attention} jobs={jobs} matches={matches} quality={quality} saved={saved} onToggleSave={(id) => (saved[id] ? unsave(id) : save(id))} />
      </div>
      <div className="hidden md:grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Greeting */}
        <div className="flex flex-wrap items-center justify-between gap-3 xl:col-span-2">
          <div>
            <p className="text-[15px] font-medium text-ink-2">
              {greeting()}, {firstName} 👋
            </p>
            <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-ink">What deserves your attention today?</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button href="/app/runs/new" icon={<Search className="size-4" aria-hidden />}>
              Find opportunities
            </Button>
            <Button href="/app/jobs" variant="outline" icon={<Search className="size-4" aria-hidden />}>
              Browse jobs
            </Button>
          </div>
        </div>

        {/* Left column */}
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="home-wonder">
            <ActiveRunCard run={activeRun} />
            {!activeRun && attention.recentRunLine && <p className="mt-2 px-1 text-[13px] text-ink-3">{attention.recentRunLine}</p>}
          </section>
          <ProgressAndWatch />

          <HomeAttentionSections attention={attention} jobs={jobs} matches={matches} quality={quality} saved={saved} onToggleSave={(id) => (saved[id] ? unsave(id) : save(id))} />
        </div>

        {/* Right rail */}
        <aside className="flex min-w-0 flex-col gap-5" aria-label="Upcoming and insights">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Upcoming</h2>
              <Link href="/app/calendar" className="text-[13px] font-medium text-brand-600 hover:underline">
                View all
              </Link>
            </div>
            <UpcomingList items={upcoming.slice(0, 3)} />
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-ink">Career Insights</h2>
              <Link href="/app/insights" className="text-[13px] text-ink-3 hover:text-ink">
                This week
              </Link>
            </div>
            {insights[0] ? <CareerInsightCard insight={insights[0]} /> : <p className="text-sm text-ink-3">Insights appear after your first run.</p>}
          </Card>
          <Card>
            <AIProviderCard />
          </Card>
        </aside>
      </div>
    </>
  );
}
