import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';

/**
 * Resolves once the browser's voice list is actually populated.
 * `speechSynthesis.getVoices()` is frequently EMPTY the instant a page
 * loads — voices are enumerated asynchronously and the `voiceschanged`
 * event fires once they're ready. Speaking before that (very likely for a
 * "first utterance right on page mount" scenario like the daily check-in)
 * is a well-documented source of silent or garbled first-utterance audio
 * in Chrome, especially on the first page load of a session. Falls back to
 * a short timeout so we never hang if the event never fires (some
 * browsers already have voices ready and never emit it).
 */
function voicesReady(synth: SpeechSynthesis): Promise<void> {
  if (synth.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      synth.removeEventListener('voiceschanged', done);
      resolve();
    };
    const timer = setTimeout(done, 300);
    synth.addEventListener('voiceschanged', done);
  });
}

/**
 * Shared text-to-speech helper (Web Speech API). Never throws — browsers that
 * don't support speechSynthesis, or that block it (e.g. no recent user
 * gesture on iOS Safari), simply produce no audio. Callers must not depend
 * on speech actually firing; the tap-based UI must remain fully functional
 * on its own.
 */
export function useTextToSpeech() {
  const { language } = useApp();

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Kick off voice loading as early as possible (component mount) rather
  // than waiting for the first speak() call, so by the time DailyCheckIn's
  // very-first "how are you feeling" narration fires, voices are usually
  // already warm.
  useEffect(() => {
    if (isSupported) window.speechSynthesis.getVoices();
  }, [isSupported]);

  // Guards against overlapping calls if speak() is invoked again before an
  // earlier (possibly still-warming) call has finished queueing.
  const speakTokenRef = useRef(0);

  const speak = useCallback((text: string) => {
    if (!isSupported || !text) return;
    const token = ++speakTokenRef.current;
    const synth = window.speechSynthesis;

    const doSpeak = () => {
      if (speakTokenRef.current !== token) return; // superseded by a newer speak() call
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language === 'hi' ? 'hi-IN' : 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        synth.speak(utterance);
      } catch {
        // Speech is a nice-to-have narration layer — never let it break the flow.
      }
    };

    voicesReady(synth).then(() => {
      if (speakTokenRef.current !== token) return;
      // Calling cancel() immediately followed by speak() in the same tick is
      // a well-known source of garbled/quiet audio in Chrome's speech engine
      // (the new utterance starts before the previous one has fully torn
      // down). Only cancel when something is actually queued/speaking, and
      // give the engine a beat to reset before queueing the next utterance.
      if (synth.speaking || synth.pending) {
        synth.cancel();
        setTimeout(doSpeak, 50);
      } else {
        doSpeak();
      }
    });
  }, [language, isSupported]);

  const cancel = useCallback(() => {
    speakTokenRef.current++; // invalidate any in-flight speak() so it won't fire after this
    if (isSupported) window.speechSynthesis?.cancel();
  }, [isSupported]);

  return { speak, cancel, isSupported };
}
