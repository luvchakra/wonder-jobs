"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Speech-to-text for free-text fields, via the browser's own Web Speech API.
 *
 * Only what the candidate actually said reaches the field: phrases are used verbatim, interim words
 * are kept separate and never saved on their own, and nothing is guessed or filled in when
 * recognition fails — the caller is told what went wrong instead.
 *
 * The API isn't in TypeScript's DOM lib, so the minimal shape used here is declared below.
 */
interface RecognitionAlternative {
  readonly transcript: string;
}
export interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
}
export interface RecognitionResultList {
  readonly length: number;
  readonly [index: number]: RecognitionResult;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: RecognitionResultList;
}
interface RecognitionErrorEvent {
  readonly error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Support can only be read in the browser; `useSyncExternalStore` keeps SSR and hydration honest about that. */
const noopSubscribe = () => () => {};
const isSupported = () => recognitionCtor() !== null;
const notOnServer = () => false;

/** Why dictation stopped, in words the candidate can act on — never a bare error code. */
const ERROR_MESSAGE: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it for this site in your browser, then try again.",
  "service-not-allowed": "Your browser wouldn't start its speech service. Check its microphone permissions.",
  "audio-capture": "No microphone was found.",
  network: "Speech-to-text couldn't reach your browser's service. Check your connection.",
};
/** Errors that end the session for good, rather than ones a fresh listen can get past. */
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "network"]);

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}
/** Compared loosely, so "Position," and "position" count as the same word across two takes. */
function key(word: string): string {
  return word.toLowerCase().replace(/[.,!?;:]+$/, "");
}
function commonPrefix(a: string[], b: string[]): number {
  let n = 0;
  while (n < a.length && n < b.length && key(a[n]) === key(b[n])) n++;
  return n;
}
/** Longest run of words that ends `a` and begins `b`. */
function overlap(a: string[], b: string[]): number {
  for (let n = Math.min(a.length, b.length); n > 0; n--) {
    let same = true;
    for (let i = 0; i < n; i++) {
      if (key(a[a.length - n + i]) !== key(b[i])) {
        same = false;
        break;
      }
    }
    if (same) return n;
  }
  return 0;
}

/** Most of a phrase agreeing with the one before it means it's another take of the same speech, not new words. */
const RETAKE_RATIO = 0.6;

/**
 * Joins the phrases a session produced into what was actually said.
 *
 * Recognizers don't hand over one tidy phrase per utterance. Android's in particular re-sends the
 * same sentence again and again as it grows it word by word — "looking", "looking for", "looking
 * for a senior" — each as its own final result. Joining those end to end is what filled the field
 * with "looking looking looking for looking for a…", so a phrase that mostly agrees with the one
 * before it is treated as a further take of it and replaces it, and one that merely picks up where
 * the last left off is stitched on at the overlap. Only genuinely new words are appended.
 */
export function mergePhrases(phrases: string[]): string {
  let acc: string[] = [];
  for (const phrase of phrases) {
    const next = words(phrase);
    if (!next.length) continue;
    if (!acc.length) {
      acc = next;
      continue;
    }
    const shared = commonPrefix(acc, next);
    if (shared > 0 && shared / Math.min(acc.length, next.length) >= RETAKE_RATIO) {
      // Another go at the same words: keep whichever take says more.
      if (next.length >= acc.length) acc = next;
      continue;
    }
    const tail = overlap(acc, next);
    acc = tail > 0 ? [...acc, ...next.slice(tail)] : [...acc, ...next];
  }
  return acc.join(" ");
}

/**
 * Folds a result list into the phrases settled so far (held by their index) and the words still
 * being revised. The list is cumulative, so a phrase already seen is overwritten in place rather
 * than added again; `mergePhrases` then reconciles takes of the same speech across indices.
 */
export function foldResults(settled: string[], results: RecognitionResultList): { settled: string[]; interim: string } {
  const next = settled.slice();
  const pending: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const text = (result?.[0]?.transcript ?? "").trim();
    if (!text) continue;
    if (result.isFinal) next[i] = text;
    else pending.push(text);
  }
  return { settled: next, interim: pending.join(" ") };
}

export interface Dictation {
  /** False during SSR and on browsers without the API — hide the control rather than offering a dead one. */
  supported: boolean;
  listening: boolean;
  /** Heard but still being revised. Shown live so the candidate can see it land; never committed on its own. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  /** Call when the field is edited by hand mid-dictation, so later speech appends to that edit. */
  rebase: (text: string) => void;
}

/**
 * How long dictation keeps restarting a session that has heard nothing before it gives up and says
 * so. Real elapsed time, not a count of sessions: a `continuous: false` session can end within a
 * second or two of completely normal conditions — mic init latency, the pause before the candidate
 * starts talking — especially on Android, so counting "N silent sessions" gave up before they'd had
 * a real chance to speak. Once anything has actually been heard, dictation never gives up on its own
 * — pauses between sentences are normal, and only an explicit Stop or a fatal error ends it.
 */
const SILENCE_TIMEOUT_MS = 12_000;

/** Whether to stop restarting and report failure, given whether anything has ever been heard yet. */
export function shouldGiveUp(everHeard: boolean, elapsedSinceStartMs: number): boolean {
  return !everHeard && elapsedSinceStartMs >= SILENCE_TIMEOUT_MS;
}

export function useDictation({ textAtStart, onText }: { textAtStart: () => string; onText: (text: string) => void }): Dictation {
  const supported = useSyncExternalStore(noopSubscribe, isSupported, notOnServer);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const settled = useRef<string[]>([]);
  const base = useRef("");
  const wantListening = useRef(false);
  const everHeard = useRef(false);
  const listenStartedAt = useRef(0);
  const onTextRef = useRef(onText);
  const textAtStartRef = useRef(textAtStart);
  // A session restarts the next one from its own `onend`, so it reaches itself through this.
  const openSessionRef = useRef<() => void>(() => {});

  useEffect(() => {
    onTextRef.current = onText;
    textAtStartRef.current = textAtStart;
  });

  useEffect(
    () => () => {
      wantListening.current = false;
      recognition.current?.abort();
      recognition.current = null;
    },
    [],
  );

  const rebase = useCallback((text: string) => {
    base.current = text;
    settled.current = [];
  }, []);

  /**
   * One utterance per session, restarted while the candidate still wants to talk. `continuous` is
   * honoured so unevenly — Android drops out of it into the re-sending behaviour above, other
   * browsers keep a session open for minutes — that driving the restarts here is the only way the
   * same thing happens everywhere.
   */
  const openSession = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (event) => {
      const folded = foldResults(settled.current, event.results);
      settled.current = folded.settled;
      setInterim(folded.interim);
      const spoken = mergePhrases(folded.settled);
      onTextRef.current(spoken ? appendDictated(base.current, spoken) : base.current);
    };
    r.onerror = (event) => {
      if (FATAL.has(event.error)) {
        wantListening.current = false;
        setError(ERROR_MESSAGE[event.error] ?? `Dictation stopped (${event.error}).`);
      }
      // Everything else — a silence, a stop the candidate asked for — is handled by `onend`.
    };
    r.onend = () => {
      recognition.current = null;
      const spoken = mergePhrases(settled.current);
      // Bank this utterance so the next session starts from it rather than replacing it.
      base.current = appendDictated(base.current, spoken);
      settled.current = [];
      setInterim("");
      if (spoken) everHeard.current = true;
      if (wantListening.current && !shouldGiveUp(everHeard.current, Date.now() - listenStartedAt.current)) {
        openSessionRef.current();
        return;
      }
      if (wantListening.current) setError("Nothing was picked up — start again and speak once the mic is on.");
      wantListening.current = false;
      setListening(false);
    };
    recognition.current = r;
    try {
      r.start();
    } catch {
      recognition.current = null;
      wantListening.current = false;
      setListening(false);
      setError("Dictation couldn't start. Try again.");
    }
  }, []);

  useEffect(() => {
    openSessionRef.current = openSession;
  });

  const start = useCallback(() => {
    if (recognition.current) return;
    setError(null);
    setInterim("");
    everHeard.current = false;
    listenStartedAt.current = Date.now();
    rebase(textAtStartRef.current());
    wantListening.current = true;
    setListening(true);
    openSession();
  }, [openSession, rebase]);

  const stop = useCallback(() => {
    wantListening.current = false;
    setListening(false);
    recognition.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (wantListening.current) stop();
    else start();
  }, [start, stop]);

  return { supported, listening, interim, error, start, stop, toggle, rebase };
}

/** Appends dictated words to what's already in the field, with the spacing a person would use. */
export function appendDictated(existing: string, spoken: string): string {
  const base = existing.trimEnd();
  if (!base) return spoken;
  if (!spoken) return base;
  return /[.!?]$/.test(base) ? `${base} ${spoken.charAt(0).toUpperCase()}${spoken.slice(1)}` : `${base} ${spoken}`;
}
