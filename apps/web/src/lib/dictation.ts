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
  "no-speech": "Nothing was picked up — start again and speak once the mic is on.",
  network: "Speech-to-text couldn't reach your browser's service. Check your connection.",
  // A stop the user asked for isn't a failure worth reporting.
  aborted: "",
};

/**
 * Folds a result list into the phrases settled so far (held by their index) and the words still
 * being revised.
 *
 * Results are *cumulative*: a browser may re-send phrases it already settled, and Android's
 * recognizer in particular re-sends a settled phrase repeatedly as it grows it word by word. So
 * each phrase is stored at its own index and overwritten in place rather than appended — replaying
 * the same event, or a longer take on the same phrase, can then never stack up duplicates.
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

/** The dictated phrases as one piece of text. */
export function joinPhrases(settled: string[]): string {
  return settled.filter(Boolean).join(" ");
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

export function useDictation({ textAtStart, onText }: { textAtStart: () => string; onText: (text: string) => void }): Dictation {
  const supported = useSyncExternalStore(noopSubscribe, isSupported, notOnServer);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const settled = useRef<string[]>([]);
  const seenResults = useRef(0);
  const base = useRef("");
  const onTextRef = useRef(onText);
  const textAtStartRef = useRef(textAtStart);

  useEffect(() => {
    onTextRef.current = onText;
    textAtStartRef.current = textAtStart;
  });

  useEffect(
    () => () => {
      recognition.current?.abort();
      recognition.current = null;
    },
    [],
  );

  const rebase = useCallback((text: string) => {
    base.current = text;
    settled.current = [];
    seenResults.current = 0;
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    setError(null);
    setInterim("");
    rebase(textAtStartRef.current());
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      // A shorter list than last time means the browser started a fresh one rather than adding to
      // it: bank what's already been said before its indices get reused by the next phrase.
      if (event.results.length < seenResults.current) {
        base.current = appendDictated(base.current, joinPhrases(settled.current));
        settled.current = [];
      }
      seenResults.current = event.results.length;
      const folded = foldResults(settled.current, event.results);
      settled.current = folded.settled;
      setInterim(folded.interim);
      const spoken = joinPhrases(folded.settled);
      onTextRef.current(spoken ? appendDictated(base.current, spoken) : base.current);
    };
    r.onerror = (event) => {
      const message = ERROR_MESSAGE[event.error] ?? `Dictation stopped (${event.error}).`;
      if (message) setError(message);
    };
    r.onend = () => {
      recognition.current = null;
      setListening(false);
      setInterim("");
    };
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setError("Dictation couldn't start. Try again.");
    }
  }, [rebase]);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (recognition.current) stop();
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
