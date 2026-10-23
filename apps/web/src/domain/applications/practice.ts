/**
 * Interview practice for one application (owner, 2026-10-23): a timed ten-question test, a mock interview
 * and a flashcard deck, each written by the candidate's AI from the posting and their Career Profile.
 * The model only proposes: every reply is parsed and checked here, and anything that doesn't fit the shape
 * is dropped — application code decides what is shown, scored and kept.
 */

export const QUIZ_LENGTH = 10;
export const QUIZ_SECONDS = 10;
export const QUIZ_PASS = 0.9;
export const FLASHCARD_COUNT = 20;
export const MOCK_MINUTES = 10;
export const MOCK_MAX_QUESTIONS = 8;

export interface QuizQuestion {
  q: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
  why?: string;
}

export interface QuizAttempt {
  id: string;
  at: string;
  score: number;
  total: number;
  passed: boolean;
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface FlashcardDeck {
  at: string;
  cards: Flashcard[];
  /** Indexes of cards the candidate marked "Know it". */
  known: number[];
  /** Demo/local sample cards (no model wrote them). */
  sample?: boolean;
}

export interface MockTurn {
  q: string;
  a: string;
}

export interface MockReview {
  /** 0–100. */
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
}

export interface MockSession extends MockReview {
  id: string;
  at: string;
  seconds: number;
  /** The questions asked, in order (answers aren't kept). */
  questions: string[];
  /** A demo/local sample review (no model scored it). */
  sample?: boolean;
}

export interface ApplicationPractice {
  quizzes: QuizAttempt[];
  mocks: MockSession[];
  flashcards?: FlashcardDeck;
}

/** How many of each are kept per application. */
export const KEEP = { quizzes: 20, mocks: 10 } as const;

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** The JSON in a model's reply: tolerates code fences and a sentence around it. */
export function jsonIn(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "");
  const start = t.search(/[[{]/);
  if (start < 0) return undefined;
  const open = t[start];
  const end = t.lastIndexOf(open === "[" ? "]" : "}");
  if (end <= start) return undefined;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

const listIn = (v: unknown, key: string): unknown[] => (Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as Record<string, unknown>)[key]) ? ((v as Record<string, unknown>)[key] as unknown[]) : []);

/** Ten well-formed questions (four distinct options, one valid answer each), or null. */
export function parseQuiz(text: string): QuizQuestion[] | null {
  const out: QuizQuestion[] = [];
  for (const raw of listIn(jsonIn(text), "questions")) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const q = clip(r.q ?? r.question, 300);
    const options = Array.isArray(r.options) ? r.options.map((o) => clip(o, 160)).filter(Boolean) : [];
    const answer = typeof r.answer === "number" ? r.answer : Number(r.answer);
    if (!q || options.length !== 4 || new Set(options.map((o) => o.toLowerCase())).size !== 4 || !Number.isInteger(answer) || answer < 0 || answer > 3) continue;
    out.push({ q, options, answer, why: clip(r.why ?? r.explanation, 300) || undefined });
    if (out.length === QUIZ_LENGTH) break;
  }
  return out.length === QUIZ_LENGTH ? out : null;
}

/** Twenty cards with a front and a back, or null. */
export function parseFlashcards(text: string): Flashcard[] | null {
  const out: Flashcard[] = [];
  for (const raw of listIn(jsonIn(text), "cards")) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const front = clip(r.front, 200);
    const back = clip(r.back, 500);
    if (front && back) out.push({ front, back });
    if (out.length === FLASHCARD_COUNT) break;
  }
  return out.length === FLASHCARD_COUNT ? out : null;
}

/** The interviewer's next question: one line of plain text, or null. */
export function parseMockQuestion(text: string): string | null {
  const q = clip(text.replace(/^["'\s]*(interviewer|question)\s*:\s*/i, "").replace(/^["']|["']$/g, ""), 400);
  return q.length >= 8 ? q : null;
}

/** A score from 0 to 100 with feedback, or null. */
export function parseMockReview(text: string): MockReview | null {
  const v = jsonIn(text);
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const score = typeof r.score === "number" ? r.score : Number(r.score);
  const summary = clip(r.summary, 600);
  const strengths = (Array.isArray(r.strengths) ? r.strengths : []).map((s) => clip(s, 240)).filter(Boolean).slice(0, 5);
  const improvements = (Array.isArray(r.improvements) ? r.improvements : []).map((s) => clip(s, 240)).filter(Boolean).slice(0, 5);
  if (!Number.isFinite(score) || score < 0 || score > 100 || !summary || !improvements.length) return null;
  return { score: Math.round(score), summary, strengths, improvements };
}

export function quizResult(answers: (number | null)[], questions: QuizQuestion[]): { score: number; total: number; passed: boolean } {
  const score = questions.reduce((n, q, i) => n + (answers[i] === q.answer ? 1 : 0), 0);
  return { score, total: questions.length, passed: questions.length > 0 && score / questions.length >= QUIZ_PASS };
}

/** A practice record with one more entry, newest first, capped. */
export function withAttempt(p: ApplicationPractice | undefined, add: { quiz?: QuizAttempt; mock?: MockSession; flashcards?: FlashcardDeck }): ApplicationPractice {
  const base: ApplicationPractice = p ?? { quizzes: [], mocks: [] };
  return {
    quizzes: add.quiz ? [add.quiz, ...base.quizzes].slice(0, KEEP.quizzes) : base.quizzes,
    mocks: add.mock ? [add.mock, ...base.mocks].slice(0, KEEP.mocks) : base.mocks,
    flashcards: add.flashcards ?? base.flashcards,
  };
}

/** The transcript so far, as the interviewer's model reads it. Answers are the candidate's own words (data). */
export function transcriptText(turns: MockTurn[]): string {
  return turns.map((t, i) => `Q${i + 1}: ${t.q}\nA${i + 1}: ${t.a || "(no answer)"}`).join("\n\n");
}

export interface PracticeTrend {
  /** Test scores as percentages, oldest first (last 12). */
  tests: number[];
  testsPassed: number;
  /** Mock interview scores, oldest first (last 12). */
  mocks: number[];
  /** Latest mock's score minus the first's in the series; undefined with fewer than two. */
  mockChange?: number;
  /** The latest mock interview, with where it was for. */
  latest?: MockSession & { applicationId: string; company: string };
}

/** Practice across every application, for Insights: from the scores and reviews the candidate kept. */
export function practiceTrend(apps: { id: string; job?: { company: string }; practice?: ApplicationPractice }[]): PracticeTrend {
  const quizzes = apps.flatMap((a) => a.practice?.quizzes ?? []).sort((x, y) => x.at.localeCompare(y.at));
  const mocks = apps.flatMap((a) => (a.practice?.mocks ?? []).map((m) => ({ ...m, applicationId: a.id, company: a.job?.company ?? "" }))).sort((x, y) => x.at.localeCompare(y.at));
  const ms = mocks.slice(-12).map((m) => m.score);
  return {
    tests: quizzes.slice(-12).map((q) => Math.round((q.score / Math.max(1, q.total)) * 100)),
    testsPassed: quizzes.filter((q) => q.passed).length,
    mocks: ms,
    mockChange: ms.length >= 2 ? ms[ms.length - 1] - ms[0] : undefined,
    latest: mocks[mocks.length - 1],
  };
}
