"use client";
import { PageHeader } from "@/components/layout/PageHeader";
import { AskWonderPanel } from "@/components/navigation/CommandPalette";

/** Ask Wonder as a page (from You): ask about your search or applications, or jump anywhere. */
export default function AskWonderPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Ask Wonder" description="Search jobs, ask about your search or applications, or jump to a page." />
      <AskWonderPanel onDone={() => {}} />
    </div>
  );
}
