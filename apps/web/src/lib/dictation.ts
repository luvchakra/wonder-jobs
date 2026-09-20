"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Speech-to-text for free-text fields, via the browser's own Web Speech API.
 *
 * Only what the candidate actually said reaches the field: final transcripts are handed to the
 * caller verbatim, interim words are kept separate and never saved on their own, and nothing is
 * guessed or filled in when recognition fails — the caller is told what went wrong instead.
 *
 * The API isn't in TypeScript's DOM lib, so the minimal shape used here is declared below.
 */
interface RecognitionAlternative {
  readonly transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
}
interface RecognitionResultList {
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

export interface Dictation {
  /** False during SSR and on browsers without the API — hide the control rather than offering a dead one. */
  supported: boolean;
  listening: boolean;
  /** Heard but not yet final. Shown live so the candidate can see it land; never committed on its own. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/** `onText` receives each finalised phrase, exactly as the browser transcribed it. */
export function useDictation(onText: (text: string) => void): Dictation {
  const supported = useSyncExternalStore(noopSubscribe, isSupported, notOnServer);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  });

  useEffect(
    () => () => {
      recognition.current?.abort();
      recognition.current = null;
    },
    [],
  );

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    setError(null);
    setInterim("");
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      let finalised = "";
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalised += text;
        else pending += text;
      }
      setInterim(pending.trim());
      const spoken = finalised.trim();
      if (spoken) onTextRef.current(spoken);
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
  }, []);

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (recognition.current) stop();
    else start();
  }, [start, stop]);

  return { supported, listening, interim, error, start, stop, toggle };
}

/** Appends a dictated phrase to what's already typed, with the spacing a person would use. */
export function appendDictated(existing: string, spoken: string): string {
  const base = existing.trimEnd();
  if (!base) return spoken;
  return /[.!?]$/.test(base) ? `${base} ${spoken.charAt(0).toUpperCase()}${spoken.slice(1)}` : `${base} ${spoken}`;
}
