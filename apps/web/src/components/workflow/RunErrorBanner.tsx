"use client";
import type { RunError, WorkflowRun } from "@/domain/workflow/types";
import { ErrorState } from "@/components/common/States";
import { getWorkflowService } from "@/services/workflow/service";
import { useRouter } from "next/navigation";
import { toast } from "@/components/feedback/Toast";

const CATEGORY_LABEL: Record<RunError["category"], string> = { recoverable: "Recoverable", partial: "Partial results", user_action_required: "Needs your action", fatal: "Stopped" };

/** Understandable errors with concrete next steps (spec §44). */
export function RunErrorBanner({ run, error, className }: { run: WorkflowRun; error: RunError; className?: string }) {
  const router = useRouter();
  const stage = run.currentStage ?? run.stages.find((s) => s.status === "FAILED")?.key ?? "search";
  const actions = error.actions.map((a) => {
    switch (a) {
      case "retry":
        return {
          label: "Retry",
          variant: "primary" as const,
          onClick: () => {
            try {
              const child = getWorkflowService().rerunFrom(run.id, stage);
              router.push(`/app/runs/${child.id}`);
            } catch (e) {
              toast.error("Couldn't retry", e instanceof Error ? e.message : undefined);
            }
          },
        };
      case "continue":
        return {
          label: "Continue with available results",
          onClick: () => {
            try {
              getWorkflowService().continue(run.id);
            } catch (e) {
              toast.error("Couldn't continue", e instanceof Error ? e.message : undefined);
            }
          },
        };
      case "fix_config":
        return { label: "Fix configuration", href: error.source && error.source !== "wonderjobs" && ["anthropic", "openai", "gemini"].includes(error.source) ? "/app/settings/ai" : "/app/runs/new" };
      case "change_provider":
        return { label: "Change provider", href: "/app/settings/ai" };
      case "stop":
        return {
          label: "Stop workflow",
          variant: "ghost" as const,
          onClick: () => {
            try {
              if (!["FAILED", "STOPPED", "COMPLETED"].includes(run.status)) getWorkflowService().stop(run.id);
            } catch (e) {
              toast.error("Couldn't stop", e instanceof Error ? e.message : undefined);
            }
          },
        };
    }
  });
  return <ErrorState className={className} title={`${CATEGORY_LABEL[error.category]}${error.source ? ` · ${error.source}` : ""}`} body={error.message} actions={actions} />;
}
