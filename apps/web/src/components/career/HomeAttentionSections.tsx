import { Sparkles } from "lucide-react";
import type { CanonicalJob, JobMatch, JobQuality } from "@/domain/jobs/types";
import type { HomeAttention } from "@/domain/career/attention";
import { SectionHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/States";
import { JobCard } from "@/components/jobs/JobCard";
import { ApplicationAttentionList } from "@/components/applications/ApplicationAttentionList";
import { AttentionList, type AttentionRow } from "./AttentionList";

/**
 * The one place that renders "what deserves my attention today" — used identically by the
 * desktop and mobile Home so they can never show different opportunities, application items or
 * career actions for the same real state.
 */
export function HomeAttentionSections({
  attention,
  jobs,
  matches,
  quality,
  saved,
  onToggleSave,
}: {
  attention: HomeAttention;
  jobs: Record<string, CanonicalJob>;
  matches: Record<string, JobMatch>;
  quality: Record<string, JobQuality>;
  saved: Record<string, string>;
  onToggleSave: (jobId: string) => void;
}) {
  const hasSectionContent = attention.opportunities.length > 0 || attention.applicationAttention.length > 0 || attention.careerActions.length > 0;

  if (!hasSectionContent) {
    return (
      <EmptyState
        icon={<Sparkles className="size-5" aria-hidden />}
        title="Nothing needs your attention right now"
        body={
          attention.isMonitoring
            ? "Wonder is monitoring your active searches. Come back when a new match, a follow-up or a reply needs you."
            : "Nothing is scheduled to search on its own yet. Run Wonder now, or set up a scheduled run so it keeps looking for you."
        }
        action={{ label: "Run Wonder", href: "/app/runs/new" }}
      />
    );
  }

  const careerRows: AttentionRow[] = attention.careerActions.map((c) => ({ key: c.id, href: c.href, label: c.label, icon: Sparkles, tone: "info" }));

  return (
    <div className="flex flex-col gap-6">
      {attention.opportunities.length > 0 && (
        <section aria-labelledby="home-opportunities">
          <SectionHeader title="Opportunities" action={{ label: "See all jobs", href: "/app/jobs" }} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attention.opportunities.map((id) => (
              <JobCard key={id} job={jobs[id]} match={matches[id]} quality={quality[id]} saved={!!saved[id]} onToggleSave={() => onToggleSave(id)} compact />
            ))}
          </div>
        </section>
      )}

      {attention.applicationAttention.length > 0 && (
        <section aria-labelledby="home-applications">
          <SectionHeader title="Applications" action={{ label: "All applications", href: "/app/applications" }} />
          <ApplicationAttentionList items={attention.applicationAttention} jobs={jobs} />
        </section>
      )}

      {careerRows.length > 0 && (
        <section aria-labelledby="home-career">
          <SectionHeader title="Career" action={{ label: "Career Profile", href: "/app/career-dna" }} />
          <AttentionList rows={careerRows} />
        </section>
      )}
    </div>
  );
}
