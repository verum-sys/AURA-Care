import { Medication } from './llm';

export interface ExtractedMedication extends Medication {
  id: string;
  durationType: 'permanent' | 'temporary';
  startDate: string;
  endDate: string | null;
  timesPerDay: number;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Adds schedule-editing defaults (duration/dates/timesPerDay) to a raw scanned or manually-typed medication. */
export function withScheduleDefaults(med: Medication, id: string): ExtractedMedication {
  return {
    ...med,
    id,
    durationType: 'permanent',
    startDate: today(),
    endDate: null,
    timesPerDay: parseTimesPerDay(med.frequency),
  };
}

/** A single blank, fully-editable medication row — the starting point for manual ("pro typer") entry. */
export function blankMedication(id: string): ExtractedMedication {
  return withScheduleDefaults(
    { name: '', nameHi: '', dosage: '', frequency: '', timing: '', beforeAfterFood: 'any', confidence: 100 },
    id
  );
}

/**
 * Derives how many times a day a medicine is taken from its prescribed
 * frequency text (LLM/OCR-extracted, so this must tolerate loose phrasing
 * and common medical abbreviations). This count is what reminder scheduling
 * (Phase 2) collapses onto the senior's routine anchors — see
 * supabase/migrations/0001_multi_caregiver_routine_medicines.sql.
 */
export function parseTimesPerDay(frequencyText: string): number {
  const f = (frequencyText || '').toLowerCase();

  if (/\b(qid|four times|4 times)\b/.test(f)) return 4;
  if (/\b(tds|tid|thrice|three times|3 times)\b/.test(f)) return 3;
  if (/\b(bd|bid|twice|two times|2 times)\b/.test(f)) return 2;
  if (/\b(od|once|one time|1 time|daily)\b/.test(f)) return 1;

  // Fall back to counting comma-separated clock times, e.g. "08:00, 20:00"
  const timeMatches = f.match(/\d{1,2}:\d{2}/g);
  if (timeMatches && timeMatches.length > 0) return timeMatches.length;

  return 1;
}
