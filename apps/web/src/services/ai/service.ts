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
  /** Context for the model: candidate + role facts. */
  prompt: string;
  /** Deterministic starting draft. Template providers return it verbatim; models refine it. */
  draft?: string;
  maxTokens?: number;
  runId?: string;
}

/** Prompt a real model receives: the facts, then the draft to improve. */
export function composePrompt(req: CompletionRequest) {
  return req.draft ? `${req.prompt}\n\n---\nStarting draft (rewrite and improve it; keep every fact truthful to the context above; where a fact is missing use a [bracketed placeholder]; output only the finished text, no preamble):\n\n${req.draft}` : req.prompt;
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
  generateFollowUpEmail(input: GenerateArtifactInput & { appliedAt?: string; kind: "follow_up" | "thank_you" }): Promise<string>;
  usage(): AIUsageRecord[];
}

const approxTokens = (s: string) => Math.max(1, Math.round(s.length / 4));

/**
 * WonderJobs AI. When the deployment has a platform model (see
 * server/providers/platform.ts) requests go through `/api/ai/complete` with
 * provider "wonderjobs"; otherwise, and for the demo, the deterministic
 * template draft is returned so the product always works. Which one happened
 * is visible in the usage record's model ("wonder-1" = template).
 */
export class WonderJobsAIProvider implements AIProvider {
  readonly id: AIProviderId = "wonderjobs";
  readonly model = "wonder-1";
  /** Null = unknown; the first request finds out. */
  private static remote: boolean | null = null;
  constructor(private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)), private readonly platformEnabled: () => boolean | null = () => WonderJobsAIProvider.remote) {}

  static setRemote(v: boolean | null) {
    WonderJobsAIProvider.remote = v;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const enabled = this.platformEnabled();
    if (enabled !== false && typeof fetch !== "undefined") {
      try {
        const res = await fetch("/api/ai/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "wonderjobs", task: req.task, system: req.system, prompt: composePrompt(req), maxTokens: req.maxTokens }) });
        const data = (await res.json().catch(() => ({}))) as Partial<CompletionResult> & { error?: string; kind?: ProviderError["kind"] };
        if (res.ok && typeof data.text === "string") {
          WonderJobsAIProvider.remote = true;
          return { text: data.text, model: data.model ?? "wonderjobs", inputTokens: data.inputTokens ?? 0, outputTokens: data.outputTokens ?? 0 };
        }
        if (res.status === 409 || res.status === 401) WonderJobsAIProvider.remote = false; // not configured / not signed in → templates
        else throw new ProviderError("wonderjobs", data.kind ?? "unknown", data.error ?? `WonderJobs AI request failed (${res.status})`);
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        // Network problem reaching our own server: fall back to the template for this request.
      }
    }
    await this.sleep(120 + Math.min(600, (req.draft ?? req.prompt).length / 6));
    const text = req.draft ?? req.prompt;
    return { text, model: this.model, inputTokens: approxTokens(req.system + req.prompt), outputTokens: approxTokens(text) };
  }
}

/** Facts a model gets before drafting. Never includes secrets; the candidate reviews everything before it leaves the product. */
function contextFor(dna: CareerDNA, job?: CanonicalJob | Job) {
  const lines = [
    `CANDIDATE`,
    `Name: ${dna.name || "[name]"}`,
    `Headline: ${dna.headline || "[headline]"}`,
    `Level: ${dna.seniority} · ${dna.yearsExperience || "[years]"} years`,
    `Career goal: ${dna.careerGoal || "[goal]"}`,
    `Skills: ${dna.skills.map((s) => `${s.name} (${s.level}/5)`).join(", ") || "[skills]"}`,
    `Industries: ${dna.industries.join(", ") || "[industries]"}`,
    `Strengths: ${dna.strengths.join("; ") || "[strengths]"}`,
    `Preferred locations: ${dna.preferredLocations.join(", ") || "[locations]"}`,
  ];
  if (job) {
    lines.push(``, `ROLE`, `Title: ${job.title}`, `Company: ${job.company}`, `Location: ${job.location} (${job.workMode})`, `Industry: ${job.industry}`, `Skills listed: ${job.skills.join(", ") || "not stated"}`, `Requirements: ${job.requirements.join(" | ") || "not stated"}`, `Posting excerpt: ${job.description.slice(0, 2500)}`);
  }
  return lines.join("\n");
}

export class TemplateAIService implements AIService {
  private records: AIUsageRecord[] = [];
  constructor(public readonly provider: AIProvider, private readonly onUsage?: (r: AIUsageRecord) => void, private readonly costPerMTok: { input: number; output: number } | null = null) {}

  private async run(task: AITask, system: string, context: string, draft: string, runId?: string) {
    const res = await this.provider.complete({ task, system, prompt: context, draft, runId });
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
    // Grounded strictly in Career DNA: the domain model carries no employment history (no companies,
    // titles, dates or metrics), so any "experience" bullet here would be invented outright. The
    // fabricated version of this template used to write "Led roadmap and discovery for a consumer
    // product used by millions" for every candidate, regardless of what they'd actually entered.
    const matched = job.skills.filter((s) => dna.skills.some((d) => d.name.toLowerCase() === s.toLowerCase()));
    const industryPhrase = dna.industries.length ? dna.industries.slice(0, 2).join(" and ").toLowerCase() : "[your industries]";
    const strengthLines = dna.strengths.length ? dna.strengths.map((s) => `- ${s}`) : ["- [Add a strength to your Career DNA]"];
    const skillLine = [...matched, ...dna.skills.filter((s) => s.level >= 4).map((s) => s.name)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8).join(" · ") || "[Add skills to your Career DNA]";
    const text = [
      `# ${dna.name || "[Your name]"}`,
      `${dna.headline || "[Your headline]"}`,
      ``,
      `## Summary`,
      `${dna.yearsExperience ? `${dna.yearsExperience}+ years` : "[years of experience]"} building ${industryPhrase} products. Targeting the ${job.title} role at ${job.company}${matched.length ? `: hands-on with ${matched.slice(0, 4).join(", ")}` : ""}.`,
      ``,
      `## Core strengths`,
      ...strengthLines,
      ``,
      `## Relevant skills`,
      skillLine,
      ``,
      `## Experience`,
      `[Add your recent roles here — company, title, dates and 2–3 measurable outcomes. Wonder doesn't have your employment history yet; import a resume that includes dates, or fill this in directly.]`,
    ].join("\n");
    return this.run("resume_generation", "You are WonderJobs, a career assistant. Tailor the candidate's resume for the target role in Markdown. Keep it truthful: only use facts from the context; never invent employers, dates or numbers; use [bracketed placeholders] for anything missing. Be concise and specific to the role.", contextFor(dna, job), text, runId);
  }

  async generateCoverLetter({ job, dna, runId }: GenerateArtifactInput) {
    // `dna.industries[0].toLowerCase()` used to throw for a minimal profile with no industries set
    // (Career DNA doesn't require one); and a candidate with exactly one industry had a second,
    // never-claimed one ("consumer") invented to fill out the sentence. Both are fixed below.
    const primaryIndustry = dna.industries[0] ? dna.industries[0].toLowerCase() : "[your industry]";
    const secondIndustry = dna.industries[1]?.toLowerCase();
    const strength0 = dna.strengths[0] ?? "[a strength from your Career DNA]";
    const strength1 = dna.strengths[1];
    const text = [
      `Dear ${job.company} Hiring Team,`,
      ``,
      `I'm excited to apply for the ${job.title} role. Over ${dna.yearsExperience || "[years of experience]"} years in ${primaryIndustry}${secondIndustry ? ` and ${secondIndustry}` : ""} products, I've learned that great outcomes come from clear priorities and honest measurement — both of which I'd bring to ${job.company}.`,
      ``,
      `What draws me to this role: ${job.requirements[1] ? job.requirements[1].toLowerCase() : "the scope"} is exactly the kind of work I do best. ${strength0}.${strength1 ? ` ${strength1}.` : ""}`,
      ``,
      `I'd welcome the chance to talk about how I can help the team move faster with more clarity.`,
      ``,
      `Warm regards,`,
      `${dna.name || "[Your name]"}`,
    ].join("\n");
    return this.run("cover_letter_generation", "You are WonderJobs, a career assistant. Write a concise, human cover letter (under 220 words) for this role, grounded only in the context. No clichés, no invented achievements; [bracketed placeholders] for missing facts.", contextFor(dna, job), text, runId);
  }

  async generateScreeningAnswers({ job, dna, runId }: GenerateArtifactInput) {
    // Every answer below used to assert something Career DNA doesn't actually contain: an industry-fit
    // claim regardless of whether the industries actually overlap, an invented "shipped end to end"
    // story, and a specific notice period ("30–60 days") nobody entered. Availability, specific project
    // outcomes and employment specifics aren't in the domain model, so they're marked for the candidate
    // to fill in rather than guessed.
    const industryMatch = dna.industries.some((i) => i.toLowerCase() === job.industry.toLowerCase());
    const shippedAnswer = dna.strengths[0] ? `${dna.strengths[0]}. [Add the specific role and outcome before submitting.]` : "[Describe a project you shipped end to end, including your role and the outcome — Wonder doesn't have this in your Career DNA yet.]";
    const text = [
      `Q: Why ${job.company}?`,
      `A: ${job.company} operates in ${job.industry.toLowerCase()}${industryMatch ? ", which is one of my target industries" : ""}. The ${job.title} scope matches my goal${dna.careerGoal ? `: ${dna.careerGoal.toLowerCase()}` : " of growing in this direction"}.`,
      ``,
      `Q: Describe a product you shipped end to end.`,
      `A: ${shippedAnswer}`,
      ``,
      `Q: Notice period / availability`,
      `A: [Add your notice period or availability date.] (Edit this before submitting.)`,
      ``,
      `Q: Expected compensation`,
      `A: ${dna.minSalary ? `Open to discuss; my expectation starts at ₹${Math.round(dna.minSalary / 100_000)}L.` : "[Add your compensation expectation, or leave open to discuss.]"} (Edit this before submitting.)`,
    ].join("\n");
    return this.run("screening_answers", "You are WonderJobs, a career assistant. Draft short answers to common screening questions for this role, in the candidate's voice, grounded only in the context. Mark anything the candidate must confirm with (Edit this before submitting).", contextFor(dna, job), text, runId);
  }

  async generateFollowUpEmail({ job, dna, appliedAt, kind, runId }: GenerateArtifactInput & { appliedAt?: string; kind: "follow_up" | "thank_you" }) {
    const when = appliedAt ? new Date(appliedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long" }) : "recently";
    const text =
      kind === "thank_you"
        ? [`Subject: Thank you — ${job.title} interview`, ``, `Hi there,`, ``, `Thank you for taking the time to speak with me about the ${job.title} role at ${job.company}. I enjoyed our conversation and came away even more excited about the team's direction.`, ``, `If it's useful, I'm happy to share more detail on ${dna.strengths[0] ? dna.strengths[0].toLowerCase() : "[a relevant strength]"}.`, ``, `Best regards,`, dna.name].join("\n")
        : [`Subject: Following up — ${job.title} application`, ``, `Hi there,`, ``, `I applied for the ${job.title} role at ${job.company} on ${when} and wanted to check in. I'm very interested in the position — ${job.requirements[1] ? job.requirements[1].toLowerCase() : "the scope"} is exactly where I do my best work.`, ``, `I'd welcome the chance to talk. Thank you for your time.`, ``, `Best regards,`, dna.name].join("\n");
    return this.run("cover_letter_generation", "You are WonderJobs, a career assistant. Draft a short, polite follow-up email (subject line first) the candidate will review before sending. Grounded only in the context.", contextFor(dna, job), text, runId);
  }

  async careerInsight({ dna, strongMatches, topTitles }: { dna: CareerDNA; strongMatches: number; topTitles: string[] }) {
    const text = strongMatches
      ? `${strongMatches} strong matches this run, mostly ${topTitles.slice(0, 2).join(" and ")} roles. Your ${dna.skills
          .filter((s) => s.level >= 5)
          .map((s) => s.name)
          .slice(0, 2)
          .join(" and ")} skills are doing the heavy lifting.`
      : "No strong matches this run. Consider widening locations or adding adjacent titles to your goal.";
    return this.run("career_insights", "You are WonderJobs. In two sentences, tell the candidate what this run's results suggest about their search, without exposing reasoning steps.", `${contextFor(dna)}\n\nRUN RESULT\nStrong matches: ${strongMatches}\nTop titles: ${topTitles.join(", ") || "none"}`, text);
  }
}

export function providerErrorMessage(e: unknown): { message: string; kind: ProviderError["kind"] } {
  if (e instanceof ProviderError) return { message: e.message, kind: e.kind };
  return { message: e instanceof Error ? e.message : "Unknown provider error", kind: "unknown" };
}

/**
 * Wraps a BYOK provider so that, only when the user opted in, a failed request
 * is retried on WonderJobs AI (platform-billed). Never silent: the caller sees
 * `fellBack` on the result via usage records carrying provider "wonderjobs".
 */
export class FallbackProvider implements AIProvider {
  readonly id: AIProviderId;
  readonly model: string;
  constructor(private readonly primary: AIProvider, private readonly fallback: AIProvider, private readonly allow: () => boolean, private readonly onFallback?: (reason: string) => void) {
    this.id = primary.id;
    this.model = primary.model;
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    try {
      return await this.primary.complete(req);
    } catch (e) {
      if (!this.allow() || !(e instanceof ProviderError)) throw e;
      this.onFallback?.(e.message);
      return this.fallback.complete(req);
    }
  }
}
