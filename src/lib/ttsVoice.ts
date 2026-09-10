export type TtsLanguage = 'en' | 'hi';

// macOS ships a set of "novelty" and legacy voices (Bad News, Bubbles,
// Zarvox, Albert, …) that sound distorted or robotic. When an utterance only
// specifies a language, Chrome takes the first matching voice in the list —
// on a Mac with these installed that is "Albert" for en-US — so they are
// excluded outright.
const LOW_QUALITY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Eddy|Flo|Fred|Good News|Grandma|Grandpa|Hysterical|Jester|Junior|Kathy|Organ|Pipe Organ|Ralph|Reed|Rocko|Sandy|Shelley|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;

// Clearest known voices first, across macOS, Chrome's own Google voices and
// Windows. Order matters.
const PREFERRED: Record<TtsLanguage, string[]> = {
  en: [
    'Samantha', 'Tara', 'Aman', 'Rishi', 'Daniel', 'Karen', 'Moira', 'Alex',
    'Google US English', 'Google UK English Female', 'Google UK English Male',
    'Microsoft Neerja', 'Microsoft Ravi', 'Microsoft Zira', 'Microsoft David',
  ],
  hi: ['Lekha', 'Google हिन्दी', 'Microsoft Swara', 'Microsoft Madhur'],
};

const langOf = (v: SpeechSynthesisVoice) => (v.lang || '').toLowerCase().replace('_', '-');

/** The clearest available voice for the language, or null to let the browser decide. */
export function pickVoice(voices: SpeechSynthesisVoice[], language: TtsLanguage): SpeechSynthesisVoice | null {
  const matching = voices.filter(v => langOf(v).startsWith(language));
  const usable = matching.filter(v => !LOW_QUALITY.test(v.name));
  for (const name of PREFERRED[language]) {
    const hit = usable.find(v => v.name === name || v.name.startsWith(`${name} `));
    if (hit) return hit;
  }
  return usable.find(v => v.localService) ?? usable[0] ?? matching[0] ?? null;
}
