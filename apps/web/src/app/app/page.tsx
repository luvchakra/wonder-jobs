"use client";
import { useMemo } from "react";
import { Briefcase, CalendarDays, Mail, Play, Search, Timer, TrendingUp, ArrowRight, Bot } from "lucide-react";
import { useCareerStore } from "@/store/career";
import { useJobsStore } from "@/store/jobs";
import { useApplicationsStore } from "@/store/applications";
import { selectActiveRun, useWorkflowStore } from "@/store/workflow";
import { greeting } from "@/lib/format";
import { useNow } from "@/lib/motion";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { SectionHeader } from "@/components/layout/PageHeader";
import { HeroScene } from "@/components/landing/HeroScene";
import { MetricTile } from "@/components/career/MetricTile";
import { ActivityItem } from "@/components/career/ActivityItem";
import { UpcomingList } from "@/components/career/UpcomingList";
import { CareerInsightCard } from "@/components/career/CareerInsightCard";
import { AIProviderCard } from "@/components/ai/AIProviderCard";
import { ActiveRunCard } from "@/components/workflow/ActiveRunCard";
import { JobCard } from "@/components/jobs/JobCard";
import { EmptyState } from "@/components/common/States";
import { MobileHome } from "@/components/career/MobileHome";
import { useAutomationStore } from "@/store/automation";
import { useUIStore } from "@/store/ui";
import Link from "next/link";

const DAY = 86_400_000;

export default function HomePage() {
  const dna = useCareerStore((s) => s.dna);
  const activity = useCareerStore((s) => s.activity);
  const upcoming = useCareerStore((s) => s.upcoming);
  const insights = useCareerStore((s) => s.insights);
  const jobs = useJobsStore((s) => s.jobs);
  const order = useJobsStore((s) => s.order);
  const matches = useJobsStore((s) => s.matches);
  const quality = useJobsStore((s) => s.quality);
  const saved = useJobsStore((s) => s.saved);
  const rejected = useJobsStore((s) => s.rejected);
  const save = useJobsStore((s) => s.save);
  const unsave = useJobsStore((s) => s.unsave);
  const applications = useApplicationsStore((s) => s.applications);
  const activeRun = useWorkflowStore(selectActiveRun);
  const defaultLevel = useAutomationStore((s) => s.defaultLevel);
  const openCommand = useUIStore((s) => s.setCommandOpen);
  const firstName = dna.name.split(" ")[0];

  const top = useMemo(() => order.filter((id) => matches[id] && !rejected[id]).sort((a, b) => matches[b].score - matches[a].score).slice(0, 3), [order, matches, rejected]);
  const now = useNow();
  const strongNew = useMemo(() => order.filter((id) => matches[id]?.fit === "strong" && now - new Date(jobs[id].postedAt).getTime() < 7 * DAY && !rejected[id]).length, [order, matches, jobs, rejected, now]);
  const apps = Object.values(applications);
  const followUpDue = apps.filter((a) => a.followUps.some((f) => !f.done && new Date(f.dueAt).getTime() - now < 2 * DAY && f.kind === "follow_up")).length;
  const interviews = apps.filter((a) => a.followUps.some((f) => !f.done && f.kind === "interview" && new Date(f.dueAt).getTime() - now < 2 * DAY)).length;
  const appsThisWeek = apps.filter((a) => now - new Date(a.createdAt).getTime() < 7 * DAY).length;
  const appByJob = new Map(apps.map((a) => [a.jobId, a]));

  return (
    <>
    <div className="md:hidden">
      <MobileHome name={dna.name} level={defaultLevel} activity={activity} activeRun={activeRun} />
    </div>
    <div className="hidden md:grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[24px] border border-line bg-surface xl:col-span-2" aria-labelledby="home-hero">
        <div className="absolute inset-y-0 right-0 hidden w-[52%] md:block">
          <HeroScene variant="dawn" className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/60 to-transparent" />
          <p className="wj-handwritten absolute left-[12%] top-[14%] rotate-[-8deg] text-[18px] text-ink-2">A better you is a few steps away.</p>
          <p className="absolute right-6 top-[16%] max-w-[180px] text-right text-[12px] italic text-ink-3">&ldquo;The future belongs to those who keep learning.&rdquo;</p>
        </div>
        <div className="relative p-5 md:p-8">
          <p className="text-[15px] font-medium text-ink-2">
            {greeting()}, {firstName} 👋
          </p>
          <h1 id="home-hero" className="mt-2 max-w-xl text-[30px] font-semibold leading-[1.05] tracking-tight text-ink md:text-[44px]">
            Big careers don&apos;t happen by luck. <span className="wj-gradient-text">Let Wonder help.</span>
          </h1>
          <p className="mt-3 max-w-md text-[15px] text-ink-3">Find better opportunities. Make smarter decisions. Do more with AI.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button href="/app/runs/new" icon={<Play className="size-4" aria-hidden />}>
              Run Wonder
            </Button>
            <Button href="/app/jobs" variant="outline" icon={<Search className="size-4" aria-hidden />}>
              Search Jobs
            </Button>
            <Button href="/app/automation/scheduled/new" variant="outline" icon={<Timer className="size-4" aria-hidden />} className="hidden sm:inline-flex">
              Create a Scheduled Run
            </Button>
          </div>
        </div>
      </section>

      {/* Left column */}
      <div className="flex min-w-0 flex-col gap-5">
        <Card padding="none" className="grid grid-cols-2 divide-line md:grid-cols-4 md:divide-x">
          <MetricTile icon={Briefcase} value={strongNew} label="new strong matches" href="/app/jobs?fit=strong" tone="brand" />
          <MetricTile icon={Mail} value={followUpDue} label="follow-up due" href="/app/applications?tab=submitted" tone="blue" />
          <MetricTile icon={CalendarDays} value={interviews} label={interviews === 1 ? "interview tomorrow" : "interviews soon"} href="/app/calendar" tone="pink" />
          <MetricTile icon={TrendingUp} value={appsThisWeek} label="applications this week" href="/app/applications" tone="success" />
        </Card>

        <ActiveRunCard run={activeRun} />

        <section aria-labelledby="top-opps">
          <SectionHeader title="Top Opportunities for You" action={{ label: "See all", href: "/app/jobs" }} />
          {top.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {top.map((id) => (
                <JobCard key={id} job={jobs[id]} match={matches[id]} quality={quality[id]} saved={!!saved[id]} onToggleSave={() => (saved[id] ? unsave(id) : save(id))} status={appByJob.get(id) ? appByJob.get(id)!.status.replace(/_/g, " ") : undefined} compact />
              ))}
            </div>
          ) : (
            <EmptyState title="No opportunities yet" body="Run Wonder to search the market and find roles that fit you." action={{ label: "Run Wonder", href: "/app/runs/new" }} />
          )}
        </section>

        <section aria-labelledby="recent-activity">
          <SectionHeader title="Recent Activity" action={{ label: "See all", href: "/app/runs" }} />
          {activity.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {activity.slice(0, 3).map((a) => (
                <ActivityItem key={a.id} item={a} />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing yet" body="Your searches, tailored resumes and prepared applications will show up here." />
          )}
        </section>
      </div>

      {/* Right rail */}
      <aside className="flex min-w-0 flex-col gap-5" aria-label="Assistant and insights">
        <Card className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white">
            <Bot className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">Hey {firstName}, I&apos;m Wonder</p>
            <p className="text-[12px] text-ink-3">I can search, analyze, prepare and track your job search. What would you like to do?</p>
          </div>
          <button type="button" onClick={() => openCommand(true)} aria-label="Ask Wonder" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white hover:bg-brand-600">
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </Card>
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
