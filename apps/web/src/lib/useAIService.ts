"use client";
import { useAIStore } from "@/store/ai";
import { FallbackProvider, TemplateAIService, WonderJobsAIProvider, type AIService } from "@/services/ai/service";
import { RemoteBYOKProvider } from "@/services/ai/client";
import { toast } from "@/components/feedback/Toast";

/** The candidate's chosen AI provider as an `AIService` — the one boundary app code uses to reach a model (CLAUDE.md). */
export function useAIService(): () => AIService {
  const aiConfig = useAIStore((s) => s.config);
  const recordUsage = useAIStore((s) => s.recordUsage);
  return () => {
    const p = aiConfig.activeProvider;
    const cost = { anthropic: { input: 5, output: 25 }, openai: { input: 2.5, output: 10 }, gemini: { input: 1.25, output: 10 } } as const;
    if (p === "wonderjobs") return new TemplateAIService(new WonderJobsAIProvider(), recordUsage, null);
    const provider = new FallbackProvider(new RemoteBYOKProvider(p, aiConfig.activeModel), new WonderJobsAIProvider(), () => aiConfig.allowPlatformFallback, (reason) => toast.info("Used WonderJobs AI for this request", reason));
    return new TemplateAIService(provider, recordUsage, cost[p]);
  };
}
