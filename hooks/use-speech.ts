'use client';
/**
 * `speechSynthesis`, read the way React wants external state read.
 *
 * The browser's speech engine is a singleton with its own lifecycle, which is
 * the textbook case for `useSyncExternalStore` and the same reason
 * `hooks/use-stored.ts` and `hooks/use-ist-today.ts` are written this way:
 * `react/react-compiler` is set to error in this repo and rejects the obvious
 * `useState` + `useEffect` version as EffectSetState.
 *
 * ── Three things about this API that are not obvious ──────────────────────
 *
 * `getVoices()` returns a NEW array on every call, and returns an empty one on
 * first call in Chrome until `voiceschanged` fires. Handing that straight to
 * `useSyncExternalStore` is the classic infinite re-render, so the list is
 * cached here and only replaced when its contents actually change.
 *
 * There is no `speaking` event. `speechSynthesis.speaking` is a poll-only
 * flag, so the state below is driven from the utterance's own `start`, `end`,
 * `error` and `boundary` callbacks instead.
 *
 * `boundary` is the only progress signal the API exposes: a character index,
 * on Chromium and Firefox, and not at all in Safari. It is enough to move a
 * portrait in time with the words and nothing like enough for lip-sync, which
 * is why `SpeakingPortrait.tsx` does not pretend to do that.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { chunkForSpeech } from '@/lib/chat/speech-text';

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

// ── Voices ────────────────────────────────────────────────────────────────

let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesKey = '';
let voicesBound = false;

function readVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return cachedVoices;
  const live = speechSynthesis.getVoices();
  // A new array every call, so compare contents and keep the old reference
  // when nothing changed. Without this the snapshot is never equal to itself.
  const key = live.map((voice) => `${voice.name}:${voice.lang}`).join('|');
  if (key !== voicesKey) {
    voicesKey = key;
    cachedVoices = live;
  }
  return cachedVoices;
}

function subscribeVoices(listener: () => void): () => void {
  listeners.add(listener);
  if (!voicesBound && speechSupported()) {
    voicesBound = true;
    // Chrome populates the list asynchronously and fires this once ready.
    speechSynthesis.addEventListener('voiceschanged', () => {
      readVoices();
      notify();
    });
  }
  return () => listeners.delete(listener);
}

export function useVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(subscribeVoices, readVoices, () => cachedVoices);
}

// ── Speaking state ────────────────────────────────────────────────────────

/**
 * WHICH answer is being spoken, not merely whether one is.
 *
 * Each reply in the transcript carries its own play button, so the panel has
 * to know which of them is the live one: the button that started it shows a
 * stop icon, its avatar animates, and the rest stay idle. A boolean cannot
 * express that, and giving every message its own subscription to a global
 * flag would light all of them up at once.
 */
let speakingId: string | null = null;
/** Character offset of the word being spoken, or -1 when that is unknown. */
let boundaryAt = -1;

function setSpeakingId(next: string | null): void {
  if (speakingId === next) return;
  speakingId = next;
  if (next === null) boundaryAt = -1;
  notify();
}

/** The id passed to `speak()`, or null when nothing is being spoken. */
export function useSpeakingId(): string | null {
  return useSyncExternalStore(subscribe, () => speakingId, () => null);
}

/** Moves once per spoken word where the browser reports it, else stays -1. */
export function useBoundary(): number {
  return useSyncExternalStore(subscribe, () => boundaryAt, () => -1);
}

// ── Control ───────────────────────────────────────────────────────────────

/**
 * A generation counter, so a cancelled queue cannot resurrect itself.
 *
 * An answer is spoken as a sequence of utterances, and each one's `end`
 * handler starts the next. `cancel()` also fires `end`, so without this a
 * stop would immediately begin the following chunk.
 */
let generation = 0;

/**
 * Some browsers accept an utterance and never speak it.
 *
 * Measured on Chrome 153 / macOS 26: `speechSynthesis` is present,
 * `getVoices()` returns 199 local voices, `speak()` throws nothing, and no
 * `start`, `end` or `error` event ever fires. The utterance simply sits in
 * the queue. Safari on the same machine and the same page speaks normally.
 *
 * Silence is the worst possible failure here, because it is indistinguishable
 * from a visitor's volume being down: they press Listen, the avatar animates,
 * and they wait. So a first chunk that has not started within
 * START_TIMEOUT_MS is treated as proof the engine does not work, the control
 * withdraws itself, and the panel says so once rather than lying repeatedly.
 */
// 2.5s, not the 1.8s this started at. Once speech was working again the
// balance changed: the cost of firing late is a visitor waiting a moment
// longer, and the cost of firing early is the control vanishing from a
// browser that would have spoken. A local voice starts in well under 200ms,
// so this only ever catches an engine that has genuinely stopped answering.
const START_TIMEOUT_MS = 2500;
let engineBroken = false;
let startTimer: ReturnType<typeof setTimeout> | null = null;

function clearStartTimer(): void {
  if (startTimer !== null) {
    clearTimeout(startTimer);
    startTimer = null;
  }
}

/** True once an utterance was accepted and never began. */
export function useSpeechBroken(): boolean {
  return useSyncExternalStore(subscribe, () => engineBroken, () => false);
}

export function stopSpeaking(): void {
  if (!speechSupported()) return;
  generation += 1;
  try {
    // Only when there is something to cancel. Chrome drops the NEXT utterance
    // if `cancel()` and `speak()` land in the same tick with an empty queue,
    // which is exactly what an unconditional cancel on every play did: the
    // avatar animated and nothing was ever heard.
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  } catch {
    /* nothing to cancel */
  }
  setSpeakingId(null);
}

/**
 * Speak one answer, cancelling whatever was being spoken.
 *
 * `id` identifies the reply in the transcript so the panel can show which one
 * is live. The text goes out as a queue of short utterances rather than one
 * long one: see `chunkForSpeech`.
 */
export function speak(id: string, text: string, voice: SpeechSynthesisVoice | null): void {
  if (!speechSupported() || !text) return;
  stopSpeaking();

  const chunks = chunkForSpeech(text);
  if (!chunks.length) return;

  const mine = generation;
  let index = 0;

  const next = (): void => {
    // A newer play, or a stop, happened while this chunk was being spoken.
    if (mine !== generation) return;
    if (index >= chunks.length) {
      setSpeakingId(null);
      return;
    }
    try {
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      index += 1;
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      utterance.rate = 1.02;
      utterance.pitch = 1;
      utterance.onstart = () => {
        // It works. Stop watching, and never doubt it again this session.
        clearStartTimer();
      };
      utterance.onend = () => {
        clearStartTimer();
        next();
      };
      utterance.onerror = () => {
        // Every error ends this reply, including `canceled`, which is our own
        // stop. The generation check is what distinguishes them: a stop has
        // already moved it on, so this is a no-op there and a real end here.
        clearStartTimer();
        if (mine === generation) setSpeakingId(null);
      };
      utterance.onboundary = (event) => {
        boundaryAt = event.charIndex;
        notify();
      };
      speechSynthesis.speak(utterance);
      // Chrome can leave the engine paused after a previous cancel, in which
      // case `speak()` queues silently and never starts.
      speechSynthesis.resume();
    } catch {
      setSpeakingId(null);
    }
  };

  setSpeakingId(id);
  next();

  // Only the first chunk is watched: if speech started once, the engine works.
  clearStartTimer();
  startTimer = setTimeout(() => {
    startTimer = null;
    if (mine !== generation) return;
    if (speechSynthesis.speaking) return;
    engineBroken = true;
    generation += 1;
    try {
      speechSynthesis.cancel();
    } catch {
      /* nothing to cancel */
    }
    setSpeakingId(null);
    notify();
  }, START_TIMEOUT_MS);
}

/** Speak it, or stop it if this is the reply already being spoken. */
export function useVoiceToggle(
  voice: SpeechSynthesisVoice | null,
  speaking: string | null,
): (id: string, text: string) => void {
  return useCallback(
    (id: string, text: string) => {
      // No priming utterance: every play is a click, and the click is itself
      // the user gesture that Safari and Chrome require.
      if (speaking === id) stopSpeaking();
      else speak(id, text, voice);
    },
    [voice, speaking],
  );
}
