// Supabase database service for AURA Care
// All operations use Clerk user IDs (text) as identifiers

import { supabase } from './supabase';

// ─── Types ──────────────────────────────────────────────
export interface DBUser {
  clerk_id: string;
  name: string;
  role: 'senior' | 'caregiver' | null;
  language: string;
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
  code: string;
  caregiver_id: string;
  caregiver_name: string;
  senior_id: string;
  senior_name: string;
  linked_at: string;
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

  // One-to-one: check if this senior already has a caregiver
  const { data: existingSeniorLink } = await supabase
    .from('caregiver_senior_links')
    .select('id')
    .eq('senior_id', seniorId)
    .maybeSingle();

  if (existingSeniorLink) return { success: false, error: 'You are already connected to a caregiver' };

  // One-to-one: check if this caregiver already has a senior
  const { data: existingCaregiverLink } = await supabase
    .from('caregiver_senior_links')
    .select('id')
    .eq('caregiver_id', codeEntry.caregiver_id)
    .maybeSingle();

  if (existingCaregiverLink) return { success: false, error: 'This caregiver is already connected to another loved one' };

  // Create the link
  const { error: linkErr } = await supabase
    .from('caregiver_senior_links')
    .insert({
      code,
      caregiver_id: codeEntry.caregiver_id,
      caregiver_name: codeEntry.caregiver_name,
      senior_id: seniorId,
      senior_name: seniorName,
    });

  if (linkErr) {
    console.error('claimPairingCode linkErr:', linkErr);
    return { success: false, error: linkErr.message };
  }

  // Mark code as claimed
  await supabase
    .from('pairing_codes')
    .update({ is_claimed: true })
    .eq('code', code);

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
  }>
): Promise<DBMedicine[]> {
  // Deactivate old medicines from this uploader for this senior
  await supabase
    .from('medicines')
    .update({ is_active: false })
    .eq('senior_id', seniorId)
    .eq('uploaded_by', uploadedBy);

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

export async function markMedicineTakenDB(medicineId: string) {
  const { error } = await supabase
    .from('medicines')
    .update({ taken: true, taken_at: new Date().toISOString() })
    .eq('id', medicineId);

  if (error) throw error;
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

export async function insertAlert(
  seniorId: string,
  alert: {
    type: 'medication' | 'inactivity' | 'distress' | 'offline';
    message: string;
    messageHi: string;
    timeLabel: string;
    severity: 'critical' | 'warning' | 'info';
  }
): Promise<DBAlert> {
  const { data, error } = await supabase
    .from('alerts')
    .insert({
      senior_id: seniorId,
      type: alert.type,
      message: alert.message,
      message_hi: alert.messageHi,
      time_label: alert.timeLabel,
      severity: alert.severity,
    })
    .select()
    .single();

  if (error) throw error;
  return data as DBAlert;
}
