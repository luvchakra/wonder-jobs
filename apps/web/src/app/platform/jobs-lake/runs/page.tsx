"use client";
import { useState } from "react";
import type { SourceRun } from "@/domain/jobslake/health";
import { Segmented } from "@/components/common/Input";
import { RunsTable } from "@/components/jobslake/Tables";
import { LoadError, Loading, PageTitle, Panel, useAdmin } from "@/components/jobslake/ui";

type Trigger = "all" | SourceRun["trigger"];

export default function RunsPage() {
  const { data, error, reload } = useAdmin<{ runs: (SourceRun & { relevant?: number; strong?: number })[] }>("runs?limit=300");
  const [trigger, setTrigger] = useState<Trigger>("all");
  const runs = (data?.runs ?? []).filter((r) => trigger === "all" || r.trigger === trigger);
  return (
    <>
      <PageTitle
        title="Runs"
        subtitle="Every time JobsLake asked a source: candidate searches, scheduled searches, tests and playground searches. “Relevant / strong” is reported back by WonderJobs after matching."
        actions={<Segmented value={trigger} onChange={setTrigger} label="Trigger" size="sm" options={[{ value: "all", label: "All" }, { value: "search", label: "Search" }, { value: "test", label: "Test" }, { value: "playground", label: "Playground" }, { value: "refresh", label: "Refresh" }]} />}
      />
      {error && <LoadError error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <Panel>
          <RunsTable runs={runs} showSource />
        </Panel>
      )}
    </>
  );
}
