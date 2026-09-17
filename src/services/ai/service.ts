/**
 * AI provider abstraction (spec §22). Application code talks to `AIService`;
 * providers implement a single `complete` primitive plus optional native
 * task overrides. WonderJobs AI runs locally (deterministic templates) so the
 * product works without any external key; BYOK providers call vendor APIs
 * from the server only.
 */
import type { AIProviderId, AITask, AIUsageRecord } from "@/domain/ai/types";
import { ProviderError } from "@/domain/ai/types";
import type { CareerDNA } from "@/domain/career/types";
import type { CanonicalJob, Job } from "@/domain/jobs/types";
import { newId } from "@/lib/ids";

export interface CompletionRequest {
  task: AITask;
  system: string;
  prompt: string;
  maxTokens?: number;
  runId?: string;
}

export interface CompletionResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AIProvider {
  readonly id: AIProviderId;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}

export interface GenerateArtifactInput {
  job: CanonicalJob | Job;
  dna: CareerDNA;
  runId?: string;
}

export interface AIService {
  readonly provider: AIProvider;
  generateResume(input: GenerateArtifactInput): Promise<string>;
  generateCoverLetter(input: GenerateArtifactInput): Promise<string>;
  generateScreeningAnswers(input: GenerateArtifactInput): Promise<string>;
  careerInsight(input: { dna: CareerDNA; strongMatches: number; topTitles: string[] }): Promise<string>;
  usage(): AIUsageRecord[];
}

const approxTokens = (s: string) => Math.max(1, Math.round(s.length / 4));

/** Platform provider: deterministic, explainable templates. No network, no billing surprises. */
export class WonderJobsAIProvider implements AIProvider {
  readonly id: AIProviderId = "wonderjobs";
  readonly model = "wonder-1";
  constructor(private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    await this.sleep(120 + Math.min(600, req.prompt.length / 6));
    const text = req.prompt; // templates are rendered by the service; the provider echoes the finished text
    return { text, model: this.model, inputTokens: approxTokens(req.system + req.prompt), outputTokens: approxTokens(text) };
  }
}

export class TemplateAIService implements AIService {
  private records: AIUsageRecord[] = [];
  constructor(public readonly provider: AIProvider, private readonly onUsage?: (r: AIUsageRecord) => void, private readonly costPerMTok: { input: number; output: number } | null = null) {}

  private async run(task: AITask, system: string, prompt: string, runId?: string) {
    const res = await this.provider.complete({ task, system, prompt, runId });
    const cost = this.costPerMTok ? (res.inputTokens * this.costPerMTok.input + res.outputTokens * this.costPerMTok.output) / 1_000_000 : null;
    const rec: AIUsageRecord = { id: newId("use"), at: new Date().toISOString(), provider: this.provider.id, model: res.model, task, inputTokens: res.inputTokens, outputTokens: res.outputTokens, costUsd: cost, runId };
    this.records.push(rec);
    this.onUsage?.(rec);
    return res.text;
  }

  usage() {
    return this.records;
  }

  async generateResume({ job, dna, runId }: GenerateArtifactInput) {
    const matched = job.skills.filter((s) => dna.skills.some((d) => d.name.toLowerCase() === s.toLowerCase()));
    const text = [
      `# ${dna.name}`,
      `${dna.headline}`,
      ``,
      `## Summary`,
      `${dna.yearsExperience}+ years building ${dna.industries.slice(0, 2).join(" and ").toLowerCase()} products. Targeting the ${job.title} role at ${job.company}: ${matched.length ? `hands-on with ${matched.slice(0, 4).join(", ")}` : "bringing strong product fundamentals"} and a record of shipping end to end.`,
      ``,
      `## Core strengths`,
      ...dna.strengths.map((s) => `- ${s}`),
      ``,
      `## Relevant skills`,
      `${[...matched, ...dna.skills.filter((s) => s.level >= 4).map((s) => s.name)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8).join(" · ")}`,
      ``,
      `## Experience highlights`,
      `- Led roadmap and discovery for a consumer product used by millions; improved activation through ${dna.skills.some((s) => s.name === "A/B Testing") ? "a structured experimentation program" : "focused discovery"}.`,
      `- Partnered with design, data and engineering to ship quarterly bets aligned to ${job.tags[0]?.toLowerCase() ?? "growth"} goals.`,
      `- Defined success metrics and dashboards that leadership used for planning.`,
    ].join("\n");
    return this.run("resume_generation", "Tailor a resume for the target role. Keep it truthful and concise.", text, runId);
  }

  async generateCoverLetter({ job, dna, runId }: GenerateArtifactInput) {
    const text = [
      `Dear ${job.company} Hiring Team,`,
      ``,
      `I'm excited to apply for the ${job.title} role. Over ${dna.yearsExperience} years in ${dna.industries[0].toLowerCase()} and ${dna.industries[1]?.toLowerCase() ?? "consumer"} products, I've learned that great outcomes come from clear priorities and honest measurement — both of which I'd bring to ${job.company}.`,
      ``,
      `What draws me to this role: ${job.requirements[1] ? job.requirements[1].toLowerCase() : "the scope"} is exactly the kind of work I do best. ${dna.strengths[0]}. ${dna.strengths[1]}.`,
      ``,
      `I'd welcome the chance to talk about how I can help the team move faster with more clarity.`,
      ``,
      `Warm regards,`,
      `${dna.name}`,
    ].join("\n");
    return this.run("cover_letter_generation", "Write a concise, human cover letter.", text, runId);
  }

  async generateScreeningAnswers({ job, dna, runId }: GenerateArtifactInput) {
    const text = [
      `Q: Why ${job.company}?`,
      `A: ${job.company} operates in ${job.industry.toLowerCase()}, which is where I've built most of my product experience. The ${job.title} scope matches my goal: ${dna.careerGoal.toLowerCase()}.`,
      ``,
      `Q: Describe a product you shipped end to end.`,
      `A: I led discovery, defined the PRD and metrics, and partnered with engineering through launch. We tracked adoption weekly and iterated based on user research and experiment results.`,
      ``,
      `Q: Notice period / availability`,
      `A: Available to start within 30–60 days. (Edit this before submitting.)`,
      ``,
      `Q: Expected compensation`,
      `A: ${dna.minSalary ? `Open to discuss; my expectation starts at ₹${Math.round(dna.minSalary / 100_000)}L.` : "Open to discuss."} (Edit this before submitting.)`,
    ].join("\n");
    return this.run("screening_answers", "Draft screening answers the candidate will review.", text, runId);
  }

  async careerInsight({ dna, strongMatches, topTitles }: { dna: CareerDNA; strongMatches: number; topTitles: string[] }) {
    const text = strongMatches
      ? `${strongMatches} strong matches this run, mostly ${topTitles.slice(0, 2).join(" and ")} roles. Your ${dna.skills
          .filter((s) => s.level >= 5)
          .map((s) => s.name)
          .slice(0, 2)
          .join(" and ")} skills are doing the heavy lifting.`
      : "No strong matches this run. Consider widening locations or adding adjacent titles to your goal.";
    return this.run("career_insights", "Summarize learning from this run without exposing reasoning.", text);
  }
}

export function providerErrorMessage(e: unknown): { message: string; kind: ProviderError["kind"] } {
  if (e instanceof ProviderError) return { message: e.message, kind: e.kind };
  return { message: e instanceof Error ? e.message : "Unknown provider error", kind: "unknown" };
}
