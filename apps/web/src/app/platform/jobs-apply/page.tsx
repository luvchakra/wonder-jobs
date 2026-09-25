"use client";
import { useCallback, useEffect, useState } from "react";
import { Activity, FileSearch, Hand, ShieldCheck } from "lucide-react";
import { ADAPTER_STATUS_LABEL, ADAPTERS, DOMAIN_POLICIES } from "@/domain/jobs-apply/adapters";
import type { ApplyOverview } from "@/server/jobsApply/admin";
import { BarList, Loading, LoadError, Meter, Note, PageTitle, Panel, Stat, num, type ApiError } from "@/components/jobslake/ui";
import { Badge } from "@/components/common/Badge";

/**
 * JobsApply operations (spec §79–§81, §146–§147): adapters and what each was verified against,
 * domain policies, and outcome counts from real sessions — never tenant ids, jobs or values.
 */
export default function JobsApplyAdminPage() {
  const [data, setData] = useState<ApplyOverview | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const fetchOverview = useCallback(async (): Promise<{ data?: ApplyOverview; error?: ApiError }> => {
    const res = await fetch("/api/jobs-apply/admin/overview", { cache: "no-store" }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    return res?.ok ? { data: body } : { error: body?.error ?? { code: "UNAVAILABLE", message: "Couldn't load JobsApply operations.", retryable: true } };
  }, []);
  const load = useCallback(() => {
    setError(null);
    void fetchOverview().then((r) => (r.data ? setData(r.data) : setError(r.error!)));
  }, [fetchOverview]);
  useEffect(() => {
    let off = false;
    void fetchOverview().then((r) => {
      if (off) return;
      if (r.data) setData(r.data);
      else setError(r.error!);
    });
    return () => {
      off = true;
    };
  }, [fetchOverview]);

  const entries = (m: Record<string, number> | undefined) => Object.entries(m ?? {}).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  return (
    <>
      <PageTitle title="JobsApply" subtitle="Candidate-controlled application help: adapters, domain policies and observed outcomes. Submission is always the candidate's — no adapter can submit." />
      {error && <LoadError error={error} onRetry={load} />}
      {!data && !error && <Loading rows={3} />}
      {data && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Sessions" value={num(data.sessions)} hint={`${num(data.tenantsSampled)} recent accounts sampled`} icon={<Activity className="size-5" aria-hidden />} />
            <Stat label="Forms detected" value={data.rates.formDetected == null ? "—" : `${Math.round(data.rates.formDetected * 100)}%`} hint="of started helper sessions" icon={<FileSearch className="size-5" aria-hidden />} />
            <Stat label="Needs-you items per form" value={data.rates.interventionPerForm == null ? "—" : data.rates.interventionPerForm.toFixed(1)} icon={<Hand className="size-5" aria-hidden />} />
            <Stat label="Confirmed by candidate" value={data.rates.submittedConfirmed == null ? "—" : `${Math.round(data.rates.submittedConfirmed * 100)}%`} hint="of started sessions" icon={<ShieldCheck className="size-5" aria-hidden />} />
          </div>
          <Panel title="Completion assistance">
            <div className="grid gap-4 md:grid-cols-2">
              <Meter label="Fill success (filled ÷ attempted)" value={data.rates.fillSuccess} />
              <Meter label="Submissions with confirmation evidence" value={data.rates.submissionVerified} judged={false} hint="Evidence is shown to the candidate; only their answer marks it submitted" />
              <Meter label="Guided-mode sessions" value={data.rates.guidedFallback} judged={false} />
            </div>
            {data.sessions === 0 && <p className="mt-3 text-[13px] text-ink-3">No sessions yet — these numbers appear once candidates use Apply with Wonder.</p>}
          </Panel>

          <Panel title="Adapters">
            <Note>
              Status comes from the adapter contract tests against WonderJobs&apos; mock portals (<code>e2e/fixtures/portals</code>) — never from URL detection alone, and never from live employer portals. Every adapter runs in the candidate&apos;s browser; no authorized
              application API is configured for any provider.
            </Note>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[12px]">
                <thead className="text-ink-3">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Adapter</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Fixture</th>
                    <th className="py-2 pr-3 font-medium">Sessions</th>
                    <th className="py-2 pr-3 font-medium">Fields found / filled / failed</th>
                    <th className="py-2 pr-3 font-medium">Needs-you</th>
                    <th className="py-2 pr-3 font-medium">Submission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ADAPTERS.map((a) => {
                    const row = data.adapters.find((r) => r.id === a.id);
                    return (
                      <tr key={a.id}>
                        <td className="py-2 pr-3">
                          <p className="font-medium text-ink">{a.name}</p>
                          <p className="text-ink-4">{a.limitations[0]}</p>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={a.status === "SUPPORTED" ? "success" : a.status === "SUPPORTED_WITH_LIMITATIONS" ? "brand" : "warning"}>{ADAPTER_STATUS_LABEL[a.status]}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-ink-2">{a.fixture ?? "none yet"}</td>
                        <td className="py-2 pr-3 tabular-nums">{num(row?.sessions ?? 0)}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {num(row?.fieldsDetected ?? 0)} / {num(row?.fieldsFilled ?? 0)} / {num(row?.fillFailures ?? 0)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{num(row?.interventions ?? 0)}</td>
                        <td className="py-2 pr-3 text-ink-2">Candidate controlled</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Failures">
              <BarList rows={entries(data.failures)} empty="No failures recorded" />
            </Panel>
            <Panel title="Needs-you by category">
              <BarList rows={entries(data.interventionCategories)} empty="No questions escalated yet" />
            </Panel>
            <Panel title="Sessions by status">
              <BarList rows={entries(data.byStatus)} empty="No sessions yet" />
            </Panel>
            <Panel title="How candidates chose to apply">
              <BarList rows={entries(data.byMode).map((r) => ({ ...r, key: r.key === "guided" ? "Guide me" : r.key === "assisted" ? "Fill for me" : "Independently" }))} empty="No sessions yet" />
            </Panel>
          </div>

          <Panel title="Domain policies">
            <ul className="divide-y divide-line">
              {DOMAIN_POLICIES.map((p) => (
                <li key={p.domain} className="flex flex-wrap items-start justify-between gap-2 py-2 text-[12px]">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{p.domain}</p>
                    <p className="text-ink-3">
                      {p.allowed.join(" · ")} — {p.note}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <Badge tone={p.status === "USER_ASSISTED_ONLY" ? "warning" : "brand"}>{ADAPTER_STATUS_LABEL[p.status]}</Badge>
                    <span className="text-ink-4">reviewed {p.lastReview}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <p className="text-[11px] text-ink-4">Generated {new Date(data.generatedAt).toLocaleString()}. Counts and categories only — no candidate, job or answer is shown here.</p>
        </div>
      )}
    </>
  );
}
