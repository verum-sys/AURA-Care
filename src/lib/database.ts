// Supabase database service for Kin Care
// All operations use Clerk user IDs (text) as identifiers

import { supabase } from './supabase';

// ─── Types ──────────────────────────────────────────────
export interface DBUser {
  clerk_id: string;
  name: string;
  role: 'senior' | 'caregiver' | null;
  language: string;
  phone: string | null;
  date_of_birth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  blood_group: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  known_conditions: string | null;
  allergies: string | null;
  notes: string | null;
  age: number | null;
  email: string | null;
  regular_medication: string | null;
  habits: string | null;
}

export interface DBPairingCode {
  code: string;
  caregiver_id: string;
  caregiver_name: string;
  is_claimed: boolean;
  created_at: string;
}

export interface DBLink {
  id: string;
  code: string | null;
  caregiver_id: string;
  caregiver_name: string;
  senior_id: string;
  senior_name: string;
  is_primary: boolean;
  linked_at: string;
  relationship: string | null;
  onboarding_completed_at: string | null;
}

export interface DBCaregiverInviteCode {
  code: string;
  senior_id: string;
  senior_name: string;
  invited_by: string;
  is_claimed: boolean;
  claimed_by: string | null;
  invitee_name: string | null;
  invitee_age: number | null;
  invitee_phone: string | null;
  invitee_email: string | null;
  created_at: string;
}

export interface DBRoutine {
  senior_id: string;
  wake_time: string;
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  sleep_time: string;
  updated_by: string | null;
  updated_at: string;
}

export interface DBMedicine {
  id: string;
  senior_id: string;
  uploaded_by: string | null;
  name: string;
  name_hi: string;
  dosage: string;
  frequency: string;
  timing: string;
  before_after_food: 'before' | 'after' | 'with' | 'any';
  duration_type: 'permanent' | 'temporary';
  start_date: string;
  end_date: string | null;
  times_per_day: number;
  taken: boolean;
  taken_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface DBWellbeing {
  id: string;
  senior_id: string;
  mood: 'good' | 'okay' | 'not_well';
  pain_area: string | null;
  created_at: string;
}

export interface DBAlert {
  id: string;
  senior_id: string;
  type: 'medication' | 'inactivity' | 'distress' | 'offline';
  message: string;
  message_hi: string;
  time_label: string;
  severity: 'critical' | 'warning' | 'info';
  is_read: boolean;
  dedupe_key: string | null;
  created_at: string;
}

export interface DBMedicineLog {
  id: string;
  senior_id: string;
  medicine_id: string;
  medicine_name: string;
  dosage: string;
  taken_date: string;   // 'YYYY-MM-DD'
  taken_at: string;
}

export interface DBMealLog {
  id: string;
  senior_id: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  eaten: boolean;
  log_date: string;     // 'YYYY-MM-DD'
  created_at: string;
}

// ─── Users ──────────────────────────────────────────────

export async function upsertUser(clerkId: string, name: string, role?: 'senior' | 'caregiver' | null) {
  const payload: Record<string, unknown> = { clerk_id: clerkId, name };
  if (role !== undefined) payload.role = role;

  const { data, error } = await supabase
    .from('users')
    .upsert(payload, { onConflict: 'clerk_id' })
    .select()
    .single();

  if (error) throw error;
  return data as DBUser;
}

export async function getUser(clerkId: string): Promise<DBUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('clerk_id', clerkId)
    .maybeSingle();

  if (error) throw error;
  return data as DBUser | null;
}

export async function updateUserRole(clerkId: string, role: 'senior' | 'caregiver' | null) {
  const { error } = await supabase
    .from('users')
    .update({ role })
    .eq('clerk_id', clerkId);

  if (error) throw error;
}

// ─── Pairing Codes ──────────────────────────────────────

function generateCodeString(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createPairingCode(caregiverId: string, caregiverName: string): Promise<string> {
  // Ensure caregiver user row exists (FK requirement)
  await supabase
    .from('users')
    .upsert({ clerk_id: caregiverId, name: caregiverName }, { onConflict: 'clerk_id' });

  // Check for existing unclaimed code
  const { data: existing } = await supabase
    .from('pairing_codes')
    .select('code')
    .eq('caregiver_id', caregiverId)
    .eq('is_claimed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.code;

  // Generate unique code
  let code: string;
  let attempts = 0;
  do {
    code = generateCodeString();
    const { data: clash } = await supabase
      .from('pairing_codes')
      .select('code')
      .eq('code', code)
      .maybeSingle();
    if (!clash) break;
    attempts++;
  } while (attempts < 20);

  const { error } = await supabase
    .from('pairing_codes')
    .insert({ code, caregiver_id: caregiverId, caregiver_name: caregiverName });

  if (error) throw error;
  return code;
}

export async function createNewPairingCode(caregiverId: string, caregiverName: string): Promise<string> {
  // Ensure caregiver user row exists (FK requirement)
  await supabase
    .from('users')
    .upsert({ clerk_id: caregiverId, name: caregiverName }, { onConflict: 'clerk_id' });

  // Mark all existing unclaimed codes as claimed (invalidate them)
  await supabase
    .from('pairing_codes')
    .update({ is_claimed: true })
    .eq('caregiver_id', caregiverId)
    .eq('is_claimed', false);

  // Generate fresh code
  let code: string;
  let attempts = 0;
  do {
    code = generateCodeString();
    const { data: clash } = await supabase
      .from('pairing_codes')
      .select('code')
      .eq('code', code)
      .maybeSingle();
    if (!clash) break;
    attempts++;
  } while (attempts < 20);

  const { error } = await supabase
    .from('pairing_codes')
    .insert({ code, caregiver_id: caregiverId, caregiver_name: caregiverName });

  if (error) throw error;
  return code;
}

export async function getActivePairingCode(caregiverId: string): Promise<string | null> {
  const { data } = await supabase
    .from('pairing_codes')
    .select('code')
    .eq('caregiver_id', caregiverId)
    .eq('is_claimed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.code ?? null;
}

export async function claimPairingCode(
  code: string,
  seniorId: string,
  seniorName: string
): Promise<{ success: boolean; error?: string }> {
  // Ensure senior user row exists (FK requirement)
  await supabase
    .from('users')
    .upsert({ clerk_id: seniorId, name: seniorName }, { onConflict: 'clerk_id' });

  // Find the unclaimed code
  const { data: codeEntry, error: findErr } = await supabase
    .from('pairing_codes')
    .select('*')
    .eq('code', code)
    .eq('is_claimed', false)
    .maybeSingle();

  if (findErr) {
    console.error('claimPairingCode findErr:', findErr);
    return { success: false, error: findErr.message };
  }
  if (!codeEntry) {
    console.error('claimPairingCode: no unclaimed code found for', code);
    return { success: false, error: 'Invalid or already used code' };
  }

  if (codeEntry.caregiver_id === seniorId) {
    return { success: false, error: 'You cannot pair with yourself. Use a different account for the caregiver.' };
  }

  // A senior can have only one PRIMARY caregiver (secondary caregivers join via a
  // separate caregiver_invite_codes flow — see claimCaregiverInviteCode).
  const { data: existingSeniorLink } = await supabase
    .from('caregiver_senior_links')
    .select('id')
    .eq('senior_id', seniorId)
    .eq('is_primary', true)
    .maybeSingle();

  if (existingSeniorLink) return { success: false, error: 'You are already connected to a caregiver' };

  // One-to-one: check if this caregiver already has a senior
  const { data: existingCaregiverLink } = await supabase
    .from('caregiver_senior_links')
    .select('id')
    .eq('caregiver_id', codeEntry.caregiver_id)
    .maybeSingle();

  if (existingCaregiverLink) return { success: false, error: 'This caregiver is already connected to another loved one' };

  // Create the link — pairing codes always create the PRIMARY caregiver relationship.
  const { error: linkErr } = await supabase
    .from('caregiver_senior_links')
    .insert({
      code,
      caregiver_id: codeEntry.caregiver_id,
      caregiver_name: codeEntry.caregiver_name,
      senior_id: seniorId,
      senior_name: seniorName,
      is_primary: true,
    });

  if (linkErr) {
    console.error('claimPairingCode linkErr:', linkErr);
    return { success: false, error: linkErr.message };
  }

  // Deliberately NOT marking the code as claimed: a caregiver's pairing code
  // is meant to be a stable "my connect code" they can share at any time —
  // e.g. to reconnect the same senior after a disconnect — not a one-shot
  // invite that stops working after first use. The one-caregiver-one-senior
  // checks above already prevent it from being misused to create a second,
  // conflicting link. Use createNewPairingCode() to explicitly rotate/
  // invalidate a code if that's ever needed.
  return { success: true };
}

// ─── Links ──────────────────────────────────────────────

export async function getLinkedSeniors(caregiverId: string): Promise<DBLink[]> {
  const { data, error } = await supabase
    .from('caregiver_senior_links')
    .select('*')
    .eq('caregiver_id', caregiverId)
    .order('linked_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DBLink[];
}

export async function getLinkedCaregivers(seniorId: string): Promise<DBLink[]> {
  const { data, error } = await supabase
    .from('caregiver_senior_links')
    .select('*')
    .eq('senior_id', seniorId)
    .order('linked_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DBLink[];
}

// ─── Medicines ──────────────────────────────────────────

export async function getMedicines(seniorId: string): Promise<DBMedicine[]> {
  const { data, error } = await supabase
    .from('medicines')
    .select('*')
    .eq('senior_id', seniorId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DBMedicine[];
}

export async function upsertMedicines(
  seniorId: string,
  uploadedBy: string,
  meds: Array<{
    name: string;
    nameHi: string;
    dosage: string;
    frequency: string;
    timing: string;
    beforeAfterFood: 'before' | 'after' | 'with' | 'any';
    durationType?: 'permanent' | 'temporary';
    startDate?: string;
    endDate?: string | null;
    timesPerDay?: number;
  }>
): Promise<DBMedicine[]> {
  // Deactivate old PERMANENT medicines from this uploader for this senior — a new
  // prescription upload replaces the standing permanent list. Temporary medicines are
  // deliberately excluded here so an unrelated permanent-medicine upload never wipes
  // a still-active, time-bound temporary medicine (only the primary caregiver removing
  // it explicitly, via deactivateMedicine, should end a temporary medicine early).
  await supabase
    .from('medicines')
    .update({ is_active: false })
    .eq('senior_id', seniorId)
    .eq('uploaded_by', uploadedBy)
    .eq('duration_type', 'permanent');

  // Insert new medicines
  const rows = meds.map(m => ({
    senior_id: seniorId,
    uploaded_by: uploadedBy,
    name: m.name,
    name_hi: m.nameHi,
    dosage: m.dosage,
    frequency: m.frequency,
    timing: m.timing,
    before_after_food: m.beforeAfterFood,
    duration_type: m.durationType ?? 'permanent',
    start_date: m.startDate ?? new Date().toISOString().slice(0, 10),
    end_date: m.endDate ?? null,
    times_per_day: m.timesPerDay ?? 1,
    taken: false,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from('medicines')
    .insert(rows)
    .select();

  if (error) throw error;
  return (data ?? []) as DBMedicine[];
}

/** Explicitly end a temporary medicine early (primary caregiver only, enforced client-side). */
export async function deactivateMedicine(medicineId: string): Promise<void> {
  const { error } = await supabase
    .from('medicines')
    .update({ is_active: false })
    .eq('id', medicineId);

  if (error) throw error;
}

export async function markMedicineTakenDB(medicineId: string, seniorId: string) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'

  // Update the medicine row
  const { error } = await supabase
    .from('medicines')
    .update({ taken: true, taken_at: now.toISOString() })
    .eq('id', medicineId);

  if (error) throw error;

  // Get medicine details for the log
  const { data: med } = await supabase
    .from('medicines')
    .select('name, dosage, senior_id')
    .eq('id', medicineId)
    .single();

  // Insert into medicine_logs (upsert — one per medicine per day)
  await supabase
    .from('medicine_logs')
    .upsert({
      medicine_id: medicineId,
      senior_id: seniorId || med?.senior_id || '',
      medicine_name: med?.name || '',
      dosage: med?.dosage || '',
      taken_date: todayStr,
      taken_at: now.toISOString(),
    }, { onConflict: 'medicine_id,taken_date' });
}

// ─── Medicine History ────────────────────────────────────

export async function getMedicineHistory(
  seniorId: string,
  days = 30
): Promise<DBMedicineLog[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('medicine_logs')
    .select('*')
    .eq('senior_id', seniorId)
    .gte('taken_date', since.toISOString().slice(0, 10))
    .order('taken_date', { ascending: false })
    .order('taken_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DBMedicineLog[];
}

/** Get today's logs for a senior — used to derive taken status */
export async function getTodayMedicineLogs(seniorId: string): Promise<DBMedicineLog[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('medicine_logs')
    .select('*')
    .eq('senior_id', seniorId)
    .eq('taken_date', today);

  if (error) throw error;
  return (data ?? []) as DBMedicineLog[];
}

// ─── Per-dose (slot) medicine tracking ────────────────────
// A medicine with e.g. timing "13:00, 17:00" is two separate doses per day.
// medicine_logs is keyed on (medicine_id, taken_date, slot) — see migration
// 0010 — so each dose is logged and asked about independently, instead of
// one "taken today" flag covering the whole day.

export async function getTodayMedicineSlotLogs(seniorId: string): Promise<{ medicine_id: string; slot: string }[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('medicine_logs')
    .select('medicine_id, slot')
    .eq('senior_id', seniorId)
    .eq('taken_date', today);

  if (error) throw error;
  return (data ?? []) as { medicine_id: string; slot: string }[];
}

export async function logMedicineSlotTaken(medicineId: string, seniorId: string, slot: string): Promise<void> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const { data: med } = await supabase
    .from('medicines')
    .select('name, dosage, senior_id')
    .eq('id', medicineId)
    .single();

  await supabase
    .from('medicine_logs')
    .upsert({
      medicine_id: medicineId,
      senior_id: seniorId || med?.senior_id || '',
      medicine_name: med?.name || '',
      dosage: med?.dosage || '',
      taken_date: todayStr,
      taken_at: now.toISOString(),
      slot,
    }, { onConflict: 'medicine_id,taken_date,slot' });

  // Keep the day-level flag in sync so adherence stats, CardDetail, and
  // Medicines.tsx — which only know "taken today: yes/no", not slots — still
  // see this medicine as taken once at least one dose today is logged.
  await supabase
    .from('medicines')
    .update({ taken: true, taken_at: now.toISOString() })
    .eq('id', medicineId);
}

// ─── Wellbeing ──────────────────────────────────────────

export async function getLatestWellbeing(seniorId: string): Promise<DBWellbeing | null> {
  const { data, error } = await supabase
    .from('wellbeing_checkins')
    .select('*')
    .eq('senior_id', seniorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as DBWellbeing | null;
}

export async function insertWellbeing(
  seniorId: string,
  mood: 'good' | 'okay' | 'not_well',
  painArea: string | null
): Promise<DBWellbeing> {
  const { data, error } = await supabase
    .from('wellbeing_checkins')
    .insert({ senior_id: seniorId, mood, pain_area: painArea })
    .select()
    .single();

  if (error) throw error;
  return data as DBWellbeing;
}

// ─── Alerts ─────────────────────────────────────────────

export async function getAlerts(seniorId: string): Promise<DBAlert[]> {
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('senior_id', seniorId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DBAlert[];
}

export async function markAlertRead(id: string): Promise<void> {
  const { error } = await supabase.from('alerts').update({ is_read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllAlertsRead(seniorId: string): Promise<void> {
  const { error } = await supabase
    .from('alerts')
    .update({ is_read: true })
    .eq('senior_id', seniorId)
    .eq('is_read', false);
  if (error) throw error;
}

// With a dedupe key the insert is idempotent per (senior, key): the browser
// fallback and the pg_cron generator (migration 0007) can both attempt the
// same alert and only the first lands. Returns null when it was a duplicate.
export async function insertAlert(
  seniorId: string,
  alert: {
    type: 'medication' | 'inactivity' | 'distress' | 'offline';
    message: string;
    messageHi: string;
    timeLabel: string;
    severity: 'critical' | 'warning' | 'info';
  },
  dedupeKey?: string
): Promise<DBAlert | null> {
  const base = {
    senior_id: seniorId,
    type: alert.type,
    message: alert.message,
    message_hi: alert.messageHi,
    time_label: alert.timeLabel,
    severity: alert.severity,
  };

  if (dedupeKey) {
    const { data, error } = await supabase
      .from('alerts')
      .upsert({ ...base, dedupe_key: dedupeKey }, { onConflict: 'senior_id,dedupe_key', ignoreDuplicates: true })
      .select()
      .maybeSingle();
    // Migration 0007 not applied yet → the column doesn't exist; fall back to
    // a plain insert so the alert still fires.
    if (!error) return (data as DBAlert | null) ?? null;
    if (!/dedupe_key/.test(error.message)) throw error;
  }

  const { data, error } = await supabase.from('alerts').insert(base).select().single();
  if (error) throw error;
  return data as DBAlert;
}

// ─── Meal Logs ───────────────────────────────────────────

export async function logMeal(
  seniorId: string,
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack',
  eaten: boolean
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  await supabase
    .from('meal_logs')
    .upsert({
      senior_id: seniorId,
      meal_type: mealType,
      eaten,
      log_date: today,
    }, { onConflict: 'senior_id,meal_type,log_date' });
}

export async function getTodayMealLogs(seniorId: string): Promise<DBMealLog[]> {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('senior_id', seniorId)
    .eq('log_date', today);

  if (error) throw error;
  return (data ?? []) as DBMealLog[];
}

export async function getMealHistory(
  seniorId: string,
  days = 30
): Promise<DBMealLog[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('meal_logs')
    .select('*')
    .eq('senior_id', seniorId)
    .gte('log_date', since.toISOString().slice(0, 10))
    .order('log_date', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DBMealLog[];
}

// ─── Wellbeing History ───────────────────────────────────

export async function getWellbeingHistory(
  seniorId: string,
  days = 30
): Promise<DBWellbeing[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('wellbeing_checkins')
    .select('*')
    .eq('senior_id', seniorId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DBWellbeing[];
}

// ─── Senior Routine ──────────────────────────────────────

export async function getSeniorRoutine(seniorId: string): Promise<DBRoutine | null> {
  const { data, error } = await supabase
    .from('senior_routines')
    .select('*')
    .eq('senior_id', seniorId)
    .maybeSingle();

  if (error) throw error;
  return data as DBRoutine | null;
}

export async function upsertSeniorRoutine(
  seniorId: string,
  updatedBy: string,
  routine: {
    wakeTime: string;
    breakfastTime: string;
    lunchTime: string;
    dinnerTime: string;
    sleepTime: string;
  }
): Promise<DBRoutine> {
  const { data, error } = await supabase
    .from('senior_routines')
    .upsert({
      senior_id: seniorId,
      wake_time: routine.wakeTime,
      breakfast_time: routine.breakfastTime,
      lunch_time: routine.lunchTime,
      dinner_time: routine.dinnerTime,
      sleep_time: routine.sleepTime,
      updated_by: updatedBy,
    }, { onConflict: 'senior_id' })
    .select()
    .single();

  if (error) throw error;
  return data as DBRoutine;
}

// ─── Patient Details ─────────────────────────────────────

// Generic per-user profile update — despite the name/first-param label this
// just updates the `users` row by clerk_id, so it's reused for BOTH a
// senior's patient details (via the caregiver-facing PatientDetails page and
// onboarding step 2) AND a caregiver's own profile (onboarding step 1),
// since each identity has its own independent row keyed by its own clerk_id.
export async function updatePatientDetails(
  seniorId: string,
  details: Partial<{
    name: string;
    phone: string | null;
    dateOfBirth: string | null;
    gender: 'male' | 'female' | 'other' | null;
    bloodGroup: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    knownConditions: string | null;
    allergies: string | null;
    notes: string | null;
    age: number | null;
    email: string | null;
    regularMedication: string | null;
    habits: string | null;
  }>
): Promise<DBUser> {
  const payload: Record<string, unknown> = {};
  if ('name' in details) payload.name = details.name;
  if ('phone' in details) payload.phone = details.phone;
  if ('dateOfBirth' in details) payload.date_of_birth = details.dateOfBirth;
  if ('gender' in details) payload.gender = details.gender;
  if ('bloodGroup' in details) payload.blood_group = details.bloodGroup;
  if ('emergencyContactName' in details) payload.emergency_contact_name = details.emergencyContactName;
  if ('emergencyContactPhone' in details) payload.emergency_contact_phone = details.emergencyContactPhone;
  if ('knownConditions' in details) payload.known_conditions = details.knownConditions;
  if ('allergies' in details) payload.allergies = details.allergies;
  if ('notes' in details) payload.notes = details.notes;
  if ('age' in details) payload.age = details.age;
  if ('email' in details) payload.email = details.email;
  if ('regularMedication' in details) payload.regular_medication = details.regularMedication;
  if ('habits' in details) payload.habits = details.habits;

  const { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('clerk_id', seniorId)
    .select()
    .single();

  if (error) throw error;
  return data as DBUser;
}

// Onboarding: caregiver's relationship to this specific senior (a property
// of the pair, not either identity alone — different caregivers linked to
// the same senior can have different relationships).
export async function updateLinkRelationship(caregiverId: string, relationship: string): Promise<void> {
  const { error } = await supabase
    .from('caregiver_senior_links')
    .update({ relationship })
    .eq('caregiver_id', caregiverId);
  if (error) throw error;
}

// Onboarding: marks the one-time wizard as finished for this caregiver<->senior
// link. NULL (never set) means "not completed yet" — skipping a step never
// calls this, which is what makes the wizard resumable rather than lost.
export async function markOnboardingComplete(caregiverId: string): Promise<void> {
  const { error } = await supabase
    .from('caregiver_senior_links')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('caregiver_id', caregiverId);
  if (error) throw error;
}

// Denormalized display-name sync — caregiver_senior_links.caregiver_name /
// senior_name are denormalized copies of users.name, read directly by
// dashboards (linkedSenior.caregiverName / activeSeniorName) without a join.
// Renaming a person via onboarding must keep both in sync.
export async function renameCaregiverOnLinks(caregiverId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('caregiver_senior_links')
    .update({ caregiver_name: name })
    .eq('caregiver_id', caregiverId);
  if (error) throw error;
}

export async function renameSeniorOnLinks(seniorId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('caregiver_senior_links')
    .update({ senior_name: name })
    .eq('senior_id', seniorId);
  if (error) throw error;
}

// ─── Secondary Caregiver Invites ─────────────────────────
// Distinct from pairing_codes: pairing codes create a NEW senior identity; invite
// codes attach a NEW caregiver to an EXISTING senior as a non-primary (read-only).

export async function createCaregiverInviteCode(
  seniorId: string,
  seniorName: string,
  invitedBy: string,
  invitee?: { name?: string; age?: number | null; phone?: string; email?: string }
): Promise<string> {
  const { data: existing } = await supabase
    .from('caregiver_invite_codes')
    .select('code')
    .eq('senior_id', seniorId)
    .eq('is_claimed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Reusing the still-unclaimed code — refresh who it's for if given.
    if (invitee) {
      await supabase
        .from('caregiver_invite_codes')
        .update({ invitee_name: invitee.name, invitee_age: invitee.age, invitee_phone: invitee.phone, invitee_email: invitee.email })
        .eq('code', existing.code);
    }
    return existing.code;
  }

  let code: string;
  let attempts = 0;
  do {
    code = generateCodeString();
    const { data: clash } = await supabase
      .from('caregiver_invite_codes')
      .select('code')
      .eq('code', code)
      .maybeSingle();
    if (!clash) break;
    attempts++;
  } while (attempts < 20);

  const { error } = await supabase
    .from('caregiver_invite_codes')
    .insert({
      code,
      senior_id: seniorId,
      senior_name: seniorName,
      invited_by: invitedBy,
      invitee_name: invitee?.name ?? null,
      invitee_age: invitee?.age ?? null,
      invitee_phone: invitee?.phone ?? null,
      invitee_email: invitee?.email ?? null,
    });

  if (error) throw error;
  return code;
}

export async function getActiveCaregiverInviteCode(seniorId: string): Promise<string | null> {
  const { data } = await supabase
    .from('caregiver_invite_codes')
    .select('code')
    .eq('senior_id', seniorId)
    .eq('is_claimed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.code ?? null;
}

// Unclaimed invites, most recent first — shown as a "pending" list on the
// Care Team page alongside already-linked caregivers.
export async function getPendingCaregiverInvites(seniorId: string): Promise<DBCaregiverInviteCode[]> {
  const { data, error } = await supabase
    .from('caregiver_invite_codes')
    .select('*')
    .eq('senior_id', seniorId)
    .eq('is_claimed', false)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as DBCaregiverInviteCode[];
}

export async function claimCaregiverInviteCode(
  code: string,
  newCaregiverId: string,
  newCaregiverName: string
): Promise<{ success: boolean; error?: string }> {
  await supabase
    .from('users')
    .upsert({ clerk_id: newCaregiverId, name: newCaregiverName }, { onConflict: 'clerk_id' });

  const { data: codeEntry, error: findErr } = await supabase
    .from('caregiver_invite_codes')
    .select('*')
    .eq('code', code)
    .eq('is_claimed', false)
    .maybeSingle();

  if (findErr) return { success: false, error: findErr.message };
  if (!codeEntry) return { success: false, error: 'Invalid or already used code' };
  if (codeEntry.senior_id === newCaregiverId) {
    return { success: false, error: 'You cannot invite yourself.' };
  }

  // This caregiver account must not already be linked to a different senior.
  const { data: existingCaregiverLink } = await supabase
    .from('caregiver_senior_links')
    .select('id')
    .eq('caregiver_id', newCaregiverId)
    .maybeSingle();

  if (existingCaregiverLink) {
    return { success: false, error: 'This account is already connected to a loved one.' };
  }

  const { error: linkErr } = await supabase
    .from('caregiver_senior_links')
    .insert({
      caregiver_id: newCaregiverId,
      caregiver_name: newCaregiverName,
      senior_id: codeEntry.senior_id,
      senior_name: codeEntry.senior_name,
      is_primary: false,
    });

  if (linkErr) return { success: false, error: linkErr.message };

  await supabase
    .from('caregiver_invite_codes')
    .update({ is_claimed: true, claimed_by: newCaregiverId })
    .eq('code', code);

  return { success: true };
}

// ─── Push Subscriptions ───────────────────────────────────

export async function savePushSubscription(
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string }
): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: sub.userAgent ?? null,
    }, { onConflict: 'endpoint' });

  if (error) throw error;
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint);

  if (error) throw error;
}

export async function getPushSubscriptions(userId: string): Promise<{ endpoint: string }[]> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_id', userId);

  if (error) throw error;
  return data ?? [];
}

// ─── FCM Tokens (native app) ──────────────────────────────

export async function saveFcmToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('fcm_tokens')
    .upsert({ user_id: userId, token }, { onConflict: 'token' });

  if (error) throw error;
}

export async function deleteFcmToken(token: string): Promise<void> {
  const { error } = await supabase
    .from('fcm_tokens')
    .delete()
    .eq('token', token);

  if (error) throw error;
}
