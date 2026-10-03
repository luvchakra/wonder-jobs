"use client";
import { Suspense } from "react";
import { PageLoading } from "@/components/common/States";
import { EmptyState } from "@/components/common/States";
import { JobsBoard } from "@/components/jobs/JobsBoard";

/** Saved: the shortlist. Every job the candidate bookmarked, whatever its fit. */
export default function SavedPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <JobsBoard savedOnly empty={<EmptyState title="Nothing saved yet" body="Tap the bookmark on a job to keep it here." action={{ label: "Find jobs", href: "/app/jobs" }} />} />
    </Suspense>
  );
}
