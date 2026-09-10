import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef, useMemo } from 'react';
import { useUser } from '@clerk/react';
import * as db from '@/lib/database';

type Language = 'en' | 'hi';
type Role = 'senior' | 'caregiver' | null;

export interface SharedMedicine {
  id: string;
  name: string;
  nameHi: string;
  dosage: string;
  frequency: string;
  timing: string;
  beforeAfterFood: 'before' | 'after' | 'with' | 'any';
  durationType: 'permanent' | 'temporary';
  startDate: string;
  endDate: string | null;
  timesPerDay: number;
  taken: boolean;
  uploadedBy?: string;
}

export type MoodValue = 'good' | 'okay' | 'not_well' | null;

export interface WellbeingEntry {
  mood: MoodValue;
  painArea: string | null;
  timestamp: string;
}

export interface AlertEntry {
  id: number | string;
  type: 'medication' | 'inactivity' | 'distress' | 'offline';
  message: string;
  messageHi: string;
  time: string;
  severity: 'critical' | 'warning' | 'info';
  isRead: boolean;
  createdAt: string;
}

export interface PairingLink {
  code: string | null;
  caregiverId: string;
  caregiverName: string;
  seniorId: string;
  seniorName: string;
  isPrimary: boolean;
  linkedAt: string;
  relationship: string | null;
  onboardingCompletedAt: string | null;
}

export interface SeniorRoutine {
  wakeTime: string;
  breakfastTime: string;
  lunchTime: string;
  dinnerTime: string;
  sleepTime: string;
}

export interface PatientDetails {
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
  regularMedication: string | null;
  habits: string | null;
}

// A caregiver's own static info — distinct from PatientDetails, which is
// always the SENIOR's row. Collected once via the onboarding wizard.
export interface CaregiverProfile {
  name: string;
  age: number | null;
  gender: 'male' | 'female' | 'other' | null;
  phone: string | null;
  email: string | null;
}

interface AppContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  role: Role;
  setRole: (role: Role) => void;
  t: (en: string, hi: string) => string;
  currentUserId: string | null;
  currentUserName: string;
  loading: boolean;
  // Pairing
  pairingCode: string | null;
  generatePairingCode: (forceNew?: boolean) => Promise<string>;
  linkWithCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  // Links — a caregiver has exactly one senior; a senior may have several caregivers
  linkedSenior: PairingLink | null;
  linkedCaregiver: PairingLink | null; // the senior's PRIMARY caregiver
  linkedCaregivers: PairingLink[]; // the senior's full caregiver list (primary + secondary)
  isPrimaryCaregiver: boolean; // this caregiver's own status on their link (default true until known)
  // Secondary caregiver invites (primary caregiver invites another caregiver to the same senior)
  generateCaregiverInviteCode: (invitee?: { name?: string; age?: number | null; phone?: string; email?: string }) => Promise<string>;
  linkAsSecondaryCaregiver: (code: string) => Promise<{ success: boolean; error?: string }>;
  // Active senior (derived from linkedSenior for caregiver view)
  activeSeniorId: string | null;
  activeSeniorName: string;
  // One-time caregiver onboarding wizard
  caregiverProfile: CaregiverProfile | null;
  updateCaregiverProfile: (profile: Partial<CaregiverProfile>) => Promise<boolean>;
  needsOnboarding: boolean; // true once linkedSenior is set but this link's onboarding isn't completed yet
  updateRelationship: (relationship: string) => Promise<boolean>;
  completeOnboarding: () => Promise<boolean>;
  // Senior routine — drives reminder scheduling; primary-caregiver-editable
  seniorRoutine: SeniorRoutine | null;
  updateRoutine: (routine: SeniorRoutine) => Promise<boolean>;
  // Patient details — primary-caregiver-editable
  patientDetails: PatientDetails | null;
  updatePatientDetails: (details: Partial<PatientDetails>) => Promise<boolean>;
  // Shared medicines (scoped per senior, taken resets daily)
  sharedMedicines: SharedMedicine[];
  setSharedMedicines: (meds: SharedMedicine[]) => Promise<void>;
  markMedicineTaken: (id: string) => Promise<void>;
  deactivateMedicine: (id: string) => Promise<void>;
  // Medicine history
  medicineHistory: db.DBMedicineLog[];
  loadMedicineHistory: () => Promise<void>;
  // Wellbeing (scoped per senior)
  wellbeing: WellbeingEntry | null;
  setWellbeing: (entry: WellbeingEntry) => Promise<void>;
  // Alerts (scoped per senior)
  dynamicAlerts: AlertEntry[];
  addAlert: (alert: Omit<AlertEntry, 'id' | 'isRead' | 'createdAt'>, dedupeKey?: string) => Promise<void>;
  markAlertRead: (id: string) => Promise<void>;
  markAllAlertsRead: () => Promise<void>;
  // Refresh
  refreshData: () => Promise<void>;
  // Reset
  resetRole: () => void;
  // Local-only "let me reconsider" navigation back to the role-selection
  // screen — does NOT touch the database. Use this for "Go Back" buttons;
  // never reuse setRole(null)/resetRole for that, since both persist the
  // role change to the account and would silently disconnect an
  // already-paired user who just wanted to look around.
  goBackToRoleSelection: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Convert DB link to app PairingLink
function toLink(l: db.DBLink): PairingLink {
  return {
    code: l.code,
    caregiverId: l.caregiver_id,
    caregiverName: l.caregiver_name,
    seniorId: l.senior_id,
    seniorName: l.senior_name,
    isPrimary: l.is_primary,
    linkedAt: l.linked_at,
    relationship: l.relationship,
    onboardingCompletedAt: l.onboarding_completed_at,
  };
}

// Convert DB medicine to app SharedMedicine
// `taken` is true only if taken_at is today — automatic daily reset
function toMedicine(m: db.DBMedicine, todayLogs?: Set<string>): SharedMedicine {
  let takenToday = false;
  if (todayLogs) {
    // Use the logs set for accuracy
    takenToday = todayLogs.has(m.id);
  } else if (m.taken && m.taken_at) {
    // Fallback: check if taken_at date matches today
    takenToday = new Date(m.taken_at).toDateString() === new Date().toDateString();
  }
  return {
    id: m.id,
    name: m.name,
    nameHi: m.name_hi,
    dosage: m.dosage,
    frequency: m.frequency,
    timing: m.timing,
    beforeAfterFood: m.before_after_food,
    durationType: m.duration_type,
    startDate: m.start_date,
    endDate: m.end_date,
    timesPerDay: m.times_per_day,
    taken: takenToday,
    uploadedBy: m.uploaded_by ?? undefined,
  };
}

// Convert DB alert to app AlertEntry
function toAlert(a: db.DBAlert): AlertEntry {
  return {
    id: a.id,
    type: a.type,
    message: a.message,
    messageHi: a.message_hi,
    time: a.time_label,
    severity: a.severity,
    isRead: a.is_read,
    createdAt: a.created_at,
  };
}

function toRoutine(r: db.DBRoutine): SeniorRoutine {
  return {
    wakeTime: r.wake_time,
    breakfastTime: r.breakfast_time,
    lunchTime: r.lunch_time,
    dinnerTime: r.dinner_time,
    sleepTime: r.sleep_time,
  };
}

function toPatientDetails(u: db.DBUser): PatientDetails {
  return {
    phone: u.phone,
    dateOfBirth: u.date_of_birth,
    gender: u.gender,
    bloodGroup: u.blood_group,
    emergencyContactName: u.emergency_contact_name,
    emergencyContactPhone: u.emergency_contact_phone,
    knownConditions: u.known_conditions,
    allergies: u.allergies,
    notes: u.notes,
    age: u.age,
    regularMedication: u.regular_medication,
    habits: u.habits,
  };
}

function toCaregiverProfile(u: db.DBUser): CaregiverProfile {
  return {
    name: u.name,
    age: u.age,
    gender: u.gender,
    phone: u.phone,
    email: u.email,
  };
}

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useUser();
  const userId = user?.id ?? null;
  const userName = user?.fullName || user?.firstName || 'User';

  const [language, setLanguage] = useState<Language>('en');
  const [role, setRoleState] = useState<Role>(null);
  const [loading, setLoading] = useState(true);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [linkedSenior, setLinkedSenior] = useState<PairingLink | null>(null);
  const [linkedCaregivers, setLinkedCaregivers] = useState<PairingLink[]>([]);
  const [caregiverProfile, setCaregiverProfile] = useState<CaregiverProfile | null>(null);
  const [seniorRoutine, setSeniorRoutine] = useState<SeniorRoutine | null>(null);
  const [patientDetails, setPatientDetails] = useState<PatientDetails | null>(null);
  const [sharedMedicines, setSharedMedicinesState] = useState<SharedMedicine[]>([]);
  const [wellbeing, setWellbeingState] = useState<WellbeingEntry | null>(null);
  const [dynamicAlerts, setDynamicAlertsState] = useState<AlertEntry[]>([]);
  const [medicineHistory, setMedicineHistory] = useState<db.DBMedicineLog[]>([]);

  const initDone = useRef(false);

  // ─── Offline cache helpers ─────────────────────────────
  // Lets a senior/caregiver still see their last-known medicines/wellbeing
  // when a Supabase fetch fails (flaky connection, backgrounded app, etc.)
  // instead of a blank screen.
  const CACHE_KEY_MEDS = 'kincare_offline_medicines';
  const CACHE_KEY_WELL = 'kincare_offline_wellbeing';

  const cacheMedicines = (meds: SharedMedicine[]) => {
    try { localStorage.setItem(CACHE_KEY_MEDS, JSON.stringify(meds)); } catch {}
  };
  const cacheWellbeing = (w: WellbeingEntry | null) => {
    try { localStorage.setItem(CACHE_KEY_WELL, JSON.stringify(w)); } catch {}
  };
  const getCachedMedicines = (): SharedMedicine[] => {
    try {
      const raw = localStorage.getItem(CACHE_KEY_MEDS);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  };
  const getCachedWellbeing = (): WellbeingEntry | null => {
    try {
      const raw = localStorage.getItem(CACHE_KEY_WELL);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  // A senior's primary caregiver, derived from the full caregiver list
  const linkedCaregiver = useMemo(
    () => linkedCaregivers.find(c => c.isPrimary) ?? linkedCaregivers[0] ?? null,
    [linkedCaregivers]
  );

  // This caregiver's OWN primary/secondary status on their own link to their senior.
  // Fails OPEN (treated as primary) unless we positively know isPrimary === false —
  // both while the link hasn't loaded yet, AND if `is_primary` comes back
  // undefined (e.g. the multi-caregiver migration hasn't been applied to this
  // database yet). This is a client-side UX gate only (RLS is fully permissive
  // everywhere in this app already), so failing open avoids locking a real
  // primary caregiver out of editing rather than failing closed.
  const isPrimaryCaregiver = linkedSenior?.isPrimary !== false;

  // True once a caregiver has a linked senior but hasn't finished the
  // one-time onboarding wizard for that link yet — drives the redirect in
  // Index.tsx and the resume banner on the dashboard. Skipping a step never
  // sets onboardingCompletedAt, which is what keeps the wizard resumable.
  const needsOnboarding = role === 'caregiver' && !!linkedSenior && !linkedSenior.onboardingCompletedAt;

  // ─── Consolidated loaders (replace 5 previously-duplicated copies) ──
  // `linkedCaregivers` is the full care team (primary + secondary) for
  // whichever senior is active — populated for BOTH a senior viewing their
  // own caregivers and a caregiver viewing their senior's full team.

  const loadCareTeam = useCallback(async (seniorId: string) => {
    const caregivers = await db.getLinkedCaregivers(seniorId);
    setLinkedCaregivers(caregivers.map(toLink));
  }, []);

  const loadCaregiverSide = useCallback(async (caregiverId: string) => {
    const seniors = await db.getLinkedSeniors(caregiverId);
    const link = seniors.length > 0 ? toLink(seniors[0]) : null;
    setLinkedSenior(link);
    // The pairing code is a stable "my connect code" (see claimPairingCode)
    // — keep it loaded regardless of connection status so a caregiver can
    // always pull it up to share, e.g. to reconnect a disconnected senior.
    const code = await db.getActivePairingCode(caregiverId);
    setPairingCode(code);
    if (link) await loadCareTeam(link.seniorId);
    const own = await db.getUser(caregiverId);
    setCaregiverProfile(own ? toCaregiverProfile(own) : null);
    return link;
  }, [loadCareTeam]);

  const loadSeniorSide = useCallback(async (seniorId: string) => {
    await loadCareTeam(seniorId);
  }, [loadCareTeam]);

  // ─── Initialize: load user profile from Supabase ──────
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    if (initDone.current) return;

    let cancelled = false;

    const init = async () => {
      try {
        // Upsert user (creates row if first time)
        await db.upsertUser(userId, userName);

        // Get stored role
        const dbUser = await db.getUser(userId);
        let effectiveRole: Role = (dbUser?.role as Role) ?? null;

        // Self-heal: a user with a live link but no stored role (seen after a
        // data reset, when the role write raced the row's re-creation) would
        // otherwise land on a half-initialised page. The link is authoritative
        // about which side they're on — infer it and persist it.
        if (!effectiveRole) {
          const [asCaregiver, asSenior] = await Promise.all([
            db.getLinkedSeniors(userId),
            db.getLinkedCaregivers(userId),
          ]);
          effectiveRole = asCaregiver.length > 0 ? 'caregiver' : asSenior.length > 0 ? 'senior' : null;
          if (effectiveRole) await db.updateUserRole(userId, effectiveRole);
        }
        if (cancelled) return;

        if (effectiveRole) {
          setRoleState(effectiveRole);
        }

        // Load links based on role
        if (effectiveRole === 'caregiver') {
          await loadCaregiverSide(userId);
        } else if (effectiveRole === 'senior') {
          await loadSeniorSide(userId);
        }
      } catch (err) {
        console.error('AppContext init error:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          initDone.current = true;
        }
      }
    };

    // `loading` was already set false by the signed-out branch above while
    // Clerk was still resolving the user; without re-arming it here, pages
    // (and Index's auto-role effect) run before the users row exists.
    setLoading(true);
    init();
    return () => { cancelled = true; };
  }, [userId, userName, loadCaregiverSide, loadSeniorSide]);

  // ─── Load linked data whenever role changes ──────────
  useEffect(() => {
    if (!userId || !role) return;
    let cancelled = false;

    const loadLinks = async () => {
      try {
        if (role === 'caregiver') {
          if (cancelled) return;
          await loadCaregiverSide(userId);
        } else if (role === 'senior') {
          if (cancelled) return;
          await loadSeniorSide(userId);
        }
      } catch (err) {
        console.error('Error loading links for role:', err);
      }
    };

    loadLinks();
    return () => { cancelled = true; };
  }, [userId, role, loadCaregiverSide, loadSeniorSide]);

  // ─── Derived: activeSeniorId from the caregiver's own link ────
  const activeSeniorId = linkedSenior?.seniorId ?? null;
  const activeSeniorName = linkedSenior?.seniorName ?? '';

  // ─── Load scoped data when activeSeniorId or role changes ─
  const scopedSeniorId = role === 'senior' ? userId : activeSeniorId;

  useEffect(() => {
    if (!scopedSeniorId) return;

    let cancelled = false;
    const loadScopedData = async () => {
      try {
        const [meds, well, alerts, todayLogs, routine, patient] = await Promise.all([
          db.getMedicines(scopedSeniorId),
          db.getLatestWellbeing(scopedSeniorId),
          db.getAlerts(scopedSeniorId),
          db.getTodayMedicineLogs(scopedSeniorId),
          db.getSeniorRoutine(scopedSeniorId),
          db.getUser(scopedSeniorId),
        ]);
        if (cancelled) return;

        const todayLogSet = new Set(todayLogs.map(l => l.medicine_id));
        const parsedMeds = meds.map(m => toMedicine(m, todayLogSet));
        const parsedWell = well ? {
          mood: well.mood,
          painArea: well.pain_area,
          timestamp: well.created_at,
        } : null;

        setSharedMedicinesState(parsedMeds);
        setWellbeingState(parsedWell);
        setDynamicAlertsState(alerts.map(toAlert));
        setSeniorRoutine(routine ? toRoutine(routine) : null);
        setPatientDetails(patient ? toPatientDetails(patient) : null);

        // Save to offline cache for when network is unavailable
        cacheMedicines(parsedMeds);
        cacheWellbeing(parsedWell);
      } catch (err) {
        console.error('Error loading scoped data, falling back to offline cache:', err);
        // Load from offline cache if network fails
        if (!cancelled) {
          const cachedMeds = getCachedMedicines();
          const cachedWell = getCachedWellbeing();
          if (cachedMeds.length > 0) setSharedMedicinesState(cachedMeds);
          if (cachedWell) setWellbeingState(cachedWell);
        }
      }
    };

    loadScopedData();
    return () => { cancelled = true; };
  }, [scopedSeniorId, role, userId]);

  // ─── Helpers ──────────────────────────────────────────
  const t = (en: string, hi: string) => language === 'en' ? en : hi;

  // ─── Set role (persisted to Supabase) + fetch linked data ─
  const setRole = useCallback(async (r: Role) => {
    setRoleState(r);
    if (!userId) return;
    try {
      // Upsert rather than update: right after sign-up this can run before
      // init has inserted the users row, and a plain UPDATE would silently
      // match zero rows — leaving the role set only in memory.
      await db.upsertUser(userId, userName, r);
      if (r === 'caregiver') {
        await loadCaregiverSide(userId);
      } else if (r === 'senior') {
        await loadSeniorSide(userId);
      }
    } catch (err) {
      console.error('Error updating role:', err);
    }
  }, [userId, userName, loadCaregiverSide, loadSeniorSide]);

  // ─── Generate pairing code ────────────────────────────
  const generatePairingCode = useCallback(async (forceNew = false): Promise<string> => {
    if (!userId) return '';
    try {
      const code = forceNew
        ? await db.createNewPairingCode(userId, userName)
        : await db.createPairingCode(userId, userName);
      setPairingCode(code);
      return code;
    } catch (err) {
      console.error('Error generating pairing code:', err);
      return '';
    }
  }, [userId, userName]);

  // ─── Link with code (senior claims a code) ────────────
  const linkWithCode = useCallback(async (code: string): Promise<{ success: boolean; error?: string }> => {
    if (!userId) return { success: false, error: 'Not logged in' };
    try {
      const result = await db.claimPairingCode(code, userId, userName);
      if (result.success) {
        await loadSeniorSide(userId);
      }
      return result;
    } catch (err) {
      console.error('Error linking with code:', err);
      return { success: false, error: 'Connection error' };
    }
  }, [userId, userName, loadSeniorSide]);

  // ─── Secondary caregiver invites ──────────────────────
  const generateCaregiverInviteCode = useCallback(async (
    invitee?: { name?: string; age?: number | null; phone?: string; email?: string }
  ): Promise<string> => {
    if (!userId || !activeSeniorId || !isPrimaryCaregiver) return '';
    try {
      return await db.createCaregiverInviteCode(activeSeniorId, activeSeniorName, userId, invitee);
    } catch (err) {
      console.error('Error generating caregiver invite code:', err);
      return '';
    }
  }, [userId, activeSeniorId, activeSeniorName, isPrimaryCaregiver]);

  const linkAsSecondaryCaregiver = useCallback(async (code: string): Promise<{ success: boolean; error?: string }> => {
    if (!userId) return { success: false, error: 'Not logged in' };
    try {
      const result = await db.claimCaregiverInviteCode(code, userId, userName);
      if (result.success) {
        await loadCaregiverSide(userId);
      }
      return result;
    } catch (err) {
      console.error('Error linking as secondary caregiver:', err);
      return { success: false, error: 'Connection error' };
    }
  }, [userId, userName, loadCaregiverSide]);

  // ─── Senior routine (primary caregiver only) ──────────
  const updateRoutine = useCallback(async (routine: SeniorRoutine): Promise<boolean> => {
    if (!scopedSeniorId || !userId) return false;
    if (role === 'caregiver' && !isPrimaryCaregiver) {
      console.warn('updateRoutine: ignored — only the primary caregiver can edit the routine.');
      return false;
    }
    try {
      await db.upsertSeniorRoutine(scopedSeniorId, userId, routine);
      setSeniorRoutine(routine);
      return true;
    } catch (err) {
      console.error('Error saving routine:', err);
      return false;
    }
  }, [scopedSeniorId, userId, role, isPrimaryCaregiver]);

  // ─── Patient details (primary caregiver only) ─────────
  const updatePatientDetails = useCallback(async (details: Partial<PatientDetails>): Promise<boolean> => {
    if (!scopedSeniorId) return false;
    if (role === 'caregiver' && !isPrimaryCaregiver) {
      console.warn('updatePatientDetails: ignored — only the primary caregiver can edit patient details.');
      return false;
    }
    try {
      const updated = await db.updatePatientDetails(scopedSeniorId, details);
      setPatientDetails(toPatientDetails(updated));
      return true;
    } catch (err) {
      console.error('Error saving patient details:', err);
      return false;
    }
  }, [scopedSeniorId, role, isPrimaryCaregiver]);

  // ─── Caregiver's own profile (no primary gate — a caregiver always owns
  // their own row) ────────────────────────────────────────
  const updateCaregiverProfile = useCallback(async (profile: Partial<CaregiverProfile>): Promise<boolean> => {
    if (!userId) return false;
    try {
      const updated = await db.updatePatientDetails(userId, profile);
      setCaregiverProfile(toCaregiverProfile(updated));
      // caregiver_senior_links.caregiver_name is a denormalized copy — keep in sync.
      if (profile.name) {
        await db.renameCaregiverOnLinks(userId, profile.name);
        setLinkedSenior(prev => prev && { ...prev, caregiverName: profile.name as string });
      }
      return true;
    } catch (err) {
      console.error('Error saving caregiver profile:', err);
      return false;
    }
  }, [userId]);

  // ─── Onboarding wizard: relationship + completion flag ─
  const updateRelationship = useCallback(async (relationship: string): Promise<boolean> => {
    if (!userId) return false;
    try {
      await db.updateLinkRelationship(userId, relationship);
      setLinkedSenior(prev => prev && { ...prev, relationship });
      return true;
    } catch (err) {
      console.error('Error saving relationship:', err);
      return false;
    }
  }, [userId]);

  const completeOnboarding = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    try {
      await db.markOnboardingComplete(userId);
      setLinkedSenior(prev => prev && { ...prev, onboardingCompletedAt: new Date().toISOString() });
      return true;
    } catch (err) {
      console.error('Error completing onboarding:', err);
      return false;
    }
  }, [userId]);

  // ─── Set shared medicines (primary caregiver only when acting as caregiver) ─
  const setSharedMedicines = useCallback(async (meds: SharedMedicine[]) => {
    if (!scopedSeniorId || !userId) return;
    if (role === 'caregiver' && !isPrimaryCaregiver) {
      console.warn('setSharedMedicines: ignored — only the primary caregiver can edit medicines.');
      return;
    }
    try {
      await db.upsertMedicines(
        scopedSeniorId,
        userId,
        meds.map(m => ({
          name: m.name,
          nameHi: m.nameHi,
          dosage: m.dosage,
          frequency: m.frequency,
          timing: m.timing,
          beforeAfterFood: m.beforeAfterFood,
          durationType: m.durationType,
          startDate: m.startDate,
          endDate: m.endDate,
          timesPerDay: m.timesPerDay,
        }))
      );
      // Reload all active medicines for this senior
      const allMeds = await db.getMedicines(scopedSeniorId);
      setSharedMedicinesState(allMeds.map(m => toMedicine(m)));
    } catch (err) {
      console.error('Error saving medicines:', err);
    }
  }, [scopedSeniorId, userId, role, isPrimaryCaregiver]);

  // ─── Mark medicine taken ──────────────────────────────
  const markMedicineTaken = useCallback(async (id: string) => {
    if (!scopedSeniorId) return;
    try {
      await db.markMedicineTakenDB(id, scopedSeniorId);
      setSharedMedicinesState(prev =>
        prev.map(m => m.id === id ? { ...m, taken: true } : m)
      );
    } catch (err) {
      console.error('Error marking medicine taken:', err);
    }
  }, [scopedSeniorId]);

  // ─── Deactivate (end early) a temporary medicine — primary caregiver only ─
  const deactivateMedicine = useCallback(async (id: string) => {
    if (role === 'caregiver' && !isPrimaryCaregiver) {
      console.warn('deactivateMedicine: ignored — only the primary caregiver can remove medicines.');
      return;
    }
    try {
      await db.deactivateMedicine(id);
      setSharedMedicinesState(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Error deactivating medicine:', err);
    }
  }, [role, isPrimaryCaregiver]);

  // ─── Load medicine history ───────────────────────────
  const loadMedicineHistory = useCallback(async () => {
    if (!scopedSeniorId) return;
    try {
      const logs = await db.getMedicineHistory(scopedSeniorId, 30);
      setMedicineHistory(logs);
    } catch (err) {
      console.error('Error loading medicine history:', err);
    }
  }, [scopedSeniorId]);

  // ─── Set wellbeing ────────────────────────────────────
  const setWellbeing = useCallback(async (entry: WellbeingEntry) => {
    if (!scopedSeniorId) return;
    try {
      await db.insertWellbeing(
        scopedSeniorId,
        entry.mood as 'good' | 'okay' | 'not_well',
        entry.painArea
      );
      setWellbeingState(entry);
    } catch (err) {
      console.error('Error saving wellbeing:', err);
    }
  }, [scopedSeniorId]);

  // ─── Add alert ────────────────────────────────────────
  const addAlert = useCallback(async (alert: Omit<AlertEntry, 'id' | 'isRead' | 'createdAt'>, dedupeKey?: string) => {
    if (!scopedSeniorId) return;
    try {
      const dbAlert = await db.insertAlert(scopedSeniorId, {
        type: alert.type,
        message: alert.message,
        messageHi: alert.messageHi,
        timeLabel: alert.time,
        severity: alert.severity,
      }, dedupeKey);
      if (dbAlert) setDynamicAlertsState(prev => [toAlert(dbAlert), ...prev]);
    } catch (err) {
      console.error('Error adding alert:', err);
    }
  }, [scopedSeniorId]);

  // Optimistic — the bell badge and list update instantly; the DB write
  // follows and the next poll/refresh reconciles if it failed.
  const markAlertRead = useCallback(async (id: string) => {
    setDynamicAlertsState(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
    try {
      await db.markAlertRead(id);
    } catch (err) {
      console.error('Error marking alert read:', err);
    }
  }, []);

  const markAllAlertsRead = useCallback(async () => {
    if (!scopedSeniorId) return;
    setDynamicAlertsState(prev => prev.map(a => ({ ...a, isRead: true })));
    try {
      await db.markAllAlertsRead(scopedSeniorId);
    } catch (err) {
      console.error('Error marking alerts read:', err);
    }
  }, [scopedSeniorId]);

  // ─── No-medicine-taken-all-day alert ─────────────────────
  const noMedAlertFired = useRef(false);

  useEffect(() => {
    if (!scopedSeniorId || sharedMedicines.length === 0) return;

    const checkNoMedicineTaken = () => {
      const now = new Date();
      const hour = now.getHours();

      // Only check after 6 PM (18:00) to give the senior a full day
      if (hour < 18) return;

      // Don't fire more than once per day
      if (noMedAlertFired.current) return;

      const anyTaken = sharedMedicines.some(m => m.taken);
      if (!anyTaken) {
        noMedAlertFired.current = true;
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        // Same dedupe key as the server-side generator (migration 0007), so
        // this browser fallback and pg_cron — or two open tabs — never double up.
        addAlert({
          type: 'medication',
          message: `No medicines have been taken today. Please check on your loved one.`,
          messageHi: `आज कोई भी दवाई नहीं ली गई है। कृपया अपनों की जाँच करें।`,
          time: timeStr,
          severity: 'critical',
        }, `nomed:${now.toISOString().slice(0, 10)}`);
      }
    };

    // Check immediately and then every 30 minutes
    checkNoMedicineTaken();
    const interval = setInterval(checkNoMedicineTaken, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, [scopedSeniorId, sharedMedicines, addAlert]);

  // Reset the no-medicine alert flag at midnight
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();

    const timeout = setTimeout(() => {
      noMedAlertFired.current = false;
    }, msUntilMidnight);

    return () => clearTimeout(timeout);
  }, []);

  // Server-side alerts (pg_cron, migration 0007) land while the app is open
  // — poll so the bell badge and Alerts page pick them up without a reload.
  useEffect(() => {
    if (role !== 'caregiver' || !scopedSeniorId) return;
    const interval = setInterval(() => {
      db.getAlerts(scopedSeniorId)
        .then(alerts => setDynamicAlertsState(alerts.map(toAlert)))
        .catch(err => console.error('Error polling alerts:', err));
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [role, scopedSeniorId]);

  // ─── Inactivity detection: alert caregiver if senior hasn't used app for 6+ hours ───
  useEffect(() => {
    if (role !== 'senior' || !scopedSeniorId) return;

    const INACTIVITY_HOURS = 6;
    const ACTIVITY_KEY = 'kincare_last_activity';
    const INACTIVITY_ALERT_KEY = 'kincare_inactivity_alert_date';

    // Record activity on any interaction
    const recordActivity = () => {
      localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
    };

    // Record now on mount
    recordActivity();

    // Listen for user interactions
    const events = ['click', 'touchstart', 'scroll', 'keydown'];
    events.forEach(e => window.addEventListener(e, recordActivity, { passive: true }));

    // Check every 30 minutes
    const interval = setInterval(() => {
      const lastStr = localStorage.getItem(ACTIVITY_KEY);
      if (!lastStr) return;

      const lastActivity = parseInt(lastStr, 10);
      const hoursSince = (Date.now() - lastActivity) / (1000 * 60 * 60);
      const today = new Date().toDateString();

      // Only fire once per day
      if (hoursSince >= INACTIVITY_HOURS && localStorage.getItem(INACTIVITY_ALERT_KEY) !== today) {
        localStorage.setItem(INACTIVITY_ALERT_KEY, today);
        const hours = Math.floor(hoursSince);
        addAlert({
          type: 'inactivity',
          message: `No activity detected from senior for ${hours} hours. Please check on them.`,
          messageHi: `बुज़ुर्ग से ${hours} घंटे से कोई गतिविधि नहीं। कृपया उनकी जाँच करें।`,
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          severity: 'critical',
        });
      }
    }, 30 * 60 * 1000);

    return () => {
      events.forEach(e => window.removeEventListener(e, recordActivity));
      clearInterval(interval);
    };
  }, [role, scopedSeniorId, addAlert]);

  // ─── Daily summary for caregiver at 9 PM ──────────────────
  useEffect(() => {
    if (role !== 'caregiver' || !scopedSeniorId || sharedMedicines.length === 0) return;

    const SUMMARY_KEY = 'kincare_daily_summary_date';

    const sendDailySummary = () => {
      const now = new Date();
      const hour = now.getHours();
      if (hour < 21) return; // Only after 9 PM

      const today = now.toDateString();
      if (localStorage.getItem(SUMMARY_KEY) === today) return; // Already sent today

      localStorage.setItem(SUMMARY_KEY, today);

      const takenCount = sharedMedicines.filter(m => m.taken).length;
      const totalMeds = sharedMedicines.length;
      const missedCount = totalMeds - takenCount;
      const moodText = wellbeing?.mood
        ? (wellbeing.mood === 'good' ? 'Good' : wellbeing.mood === 'okay' ? 'Okay' : 'Not Well')
        : 'Not checked';
      const moodTextHi = wellbeing?.mood
        ? (wellbeing.mood === 'good' ? 'अच्छा' : wellbeing.mood === 'okay' ? 'ठीक' : 'अच्छा नहीं')
        : 'दर्ज नहीं';

      const missedNames = sharedMedicines.filter(m => !m.taken).map(m => m.name).join(', ');
      const missedNamesHi = sharedMedicines.filter(m => !m.taken).map(m => m.nameHi || m.name).join(', ');

      addAlert({
        type: 'medication',
        message: `Daily Summary: ${takenCount}/${totalMeds} medicines taken. ${missedCount > 0 ? `Missed: ${missedNames}.` : 'All taken!'} Mood: ${moodText}.`,
        messageHi: `दैनिक सारांश: ${takenCount}/${totalMeds} दवाइयाँ ली गईं। ${missedCount > 0 ? `छूटी: ${missedNamesHi}।` : 'सब ली गईं!'} मूड: ${moodTextHi}।`,
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        severity: missedCount > 0 ? 'warning' : 'info',
      });
    };

    // Check immediately and every 15 min
    sendDailySummary();
    const interval = setInterval(sendDailySummary, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [role, scopedSeniorId, sharedMedicines, wellbeing, addAlert]);

  // ─── Refresh all data ─────────────────────────────────
  const refreshData = useCallback(async () => {
    if (!userId) return;
    try {
      if (role === 'caregiver') {
        await loadCaregiverSide(userId);
      } else if (role === 'senior') {
        await loadSeniorSide(userId);
      }
      if (scopedSeniorId) {
        const [meds, well, alerts, routine, patient] = await Promise.all([
          db.getMedicines(scopedSeniorId),
          db.getLatestWellbeing(scopedSeniorId),
          db.getAlerts(scopedSeniorId),
          db.getSeniorRoutine(scopedSeniorId),
          db.getUser(scopedSeniorId),
        ]);
        setSharedMedicinesState(meds.map(m => toMedicine(m)));
        setWellbeingState(well ? {
          mood: well.mood,
          painArea: well.pain_area,
          timestamp: well.created_at,
        } : null);
        setDynamicAlertsState(alerts.map(toAlert));
        setSeniorRoutine(routine ? toRoutine(routine) : null);
        setPatientDetails(patient ? toPatientDetails(patient) : null);
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  }, [userId, role, scopedSeniorId, loadCaregiverSide, loadSeniorSide]);

  // ─── Reset role ───────────────────────────────────────
  const resetRole = useCallback(() => {
    setRoleState(null);
    setPairingCode(null);
    setLinkedSenior(null);
    setLinkedCaregivers([]);
    setSeniorRoutine(null);
    setPatientDetails(null);
    setSharedMedicinesState([]);
    setWellbeingState(null);
    setDynamicAlertsState([]);
    setMedicineHistory([]);
    initDone.current = false;
    if (userId) {
      db.updateUserRole(userId, null).catch(console.error);
    }
  }, [userId]);

  const goBackToRoleSelection = useCallback(() => {
    setRoleState(null);
  }, []);

  return (
    <AppContext.Provider value={{
      language, setLanguage, role, setRole, t,
      currentUserId: userId, currentUserName: userName,
      loading,
      pairingCode, generatePairingCode, linkWithCode,
      linkedSenior, linkedCaregiver, linkedCaregivers, isPrimaryCaregiver,
      generateCaregiverInviteCode, linkAsSecondaryCaregiver,
      activeSeniorId, activeSeniorName,
      caregiverProfile, updateCaregiverProfile, needsOnboarding, updateRelationship, completeOnboarding,
      seniorRoutine, updateRoutine,
      patientDetails, updatePatientDetails,
      sharedMedicines, setSharedMedicines, markMedicineTaken, deactivateMedicine,
      medicineHistory, loadMedicineHistory,
      wellbeing, setWellbeing,
      dynamicAlerts, addAlert, markAlertRead, markAllAlertsRead,
      refreshData,
      resetRole,
      goBackToRoleSelection,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
