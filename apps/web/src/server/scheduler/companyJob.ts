/**
 * JobsLake's company refresh as the scheduler runs it — from the daily cron or an admin's Run now:
 * the settings in force, then the refresh, then one line in the run log.
 */
import { refreshCompanies, type CompanyRefreshReport } from "@/server/jobslake/companyRefresh";
import { loadScheduler, recordCronRun } from "./store";

export async function runCompanyRefresh(trigger: "cron" | "admin"): Promise<{ outcome: "ok" | "skipped" | "failed"; report?: CompanyRefreshReport; error?: string }> {
  const startedAt = new Date().toISOString();
  const settings = (await loadScheduler()).companyRefresh;
  // An admin's Run now runs even while the daily run is turned off.
  if (!settings.enabled && trigger === "cron") {
    await recordCronRun({ job: "jobslake-companies", trigger, startedAt, finishedAt: new Date().toISOString(), outcome: "skipped", summary: "Turned off in Scheduler" });
    return { outcome: "skipped" };
  }
  try {
    const report = await refreshCompanies({ budgetMs: settings.budgetSec * 1000, logoLimit: settings.logoLimit });
    await recordCronRun({ job: "jobslake-companies", trigger, startedAt, finishedAt: new Date().toISOString(), outcome: "ok", summary: `${report.postings} postings · ${report.companies} companies · ${report.logosChecked} logos checked, ${report.logosFound} found · ${report.jobTypesFilled} job types filled · Wikidata ${report.wikidataFound} of ${report.wikidataChecked} · websites found for ${report.namesResolved} of ${report.namesAsked} companies without a domain` });
    return { outcome: "ok", report };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await recordCronRun({ job: "jobslake-companies", trigger, startedAt, finishedAt: new Date().toISOString(), outcome: "failed", summary: `Failed: ${error}` });
    return { outcome: "failed", error };
  }
}
