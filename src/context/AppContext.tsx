import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
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
}

export interface PairingLink {
  code: string;
  caregiverId: string;
  caregiverName: string;
  seniorId: string;
  seniorName: string;
  linkedAt: string;
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
  // One-to-one links
  linkedSenior: PairingLink | null;
  linkedCaregiver: PairingLink | null;
  // Active senior (derived from linkedSenior for caregiver view)
  activeSeniorId: string | null;
  activeSeniorName: string;
  // Shared medicines (scoped per senior, taken resets daily)
  sharedMedicines: SharedMedicine[];
  setSharedMedicines: (meds: SharedMedicine[]) => Promise<void>;
  markMedicineTaken: (id: string) => Promise<void>;
  // Medicine history
  medicineHistory: db.DBMedicineLog[];
  loadMedicineHistory: () => Promise<void>;
  // Wellbeing (scoped per senior)
  wellbeing: WellbeingEntry | null;
  setWellbeing: (entry: WellbeingEntry) => Promise<void>;
  // Alerts (scoped per senior)
  dynamicAlerts: AlertEntry[];
  addAlert: (alert: Omit<AlertEntry, 'id'>) => Promise<void>;
  // Refresh
  refreshData: () => Promise<void>;
  // Reset
  resetRole: () => void;
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
    linkedAt: l.linked_at,
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
  const [linkedCaregiver, setLinkedCaregiver] = useState<PairingLink | null>(null);
  const [sharedMedicines, setSharedMedicinesState] = useState<SharedMedicine[]>([]);
  const [wellbeing, setWellbeingState] = useState<WellbeingEntry | null>(null);
  const [dynamicAlerts, setDynamicAlertsState] = useState<AlertEntry[]>([]);
  const [medicineHistory, setMedicineHistory] = useState<db.DBMedicineLog[]>([]);

  const initDone = useRef(false);

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
        if (cancelled) return;

        if (dbUser?.role) {
          setRoleState(dbUser.role as Role);
        }

        // Load links based on role
        if (dbUser?.role === 'caregiver') {
          const seniors = await db.getLinkedSeniors(userId);
          if (cancelled) return;
          setLinkedSenior(seniors.length > 0 ? toLink(seniors[0]) : null);

          const code = await db.getActivePairingCode(userId);
          if (cancelled) return;
          setPairingCode(code);
        } else if (dbUser?.role === 'senior') {
          const caregivers = await db.getLinkedCaregivers(userId);
          if (cancelled) return;
          setLinkedCaregiver(caregivers.length > 0 ? toLink(caregivers[0]) : null);
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

    init();
    return () => { cancelled = true; };
  }, [userId, userName]);

  // ─── Load linked data whenever role changes ──────────
  useEffect(() => {
    if (!userId || !role) return;
    let cancelled = false;

    const loadLinks = async () => {
      try {
        if (role === 'caregiver') {
          const seniors = await db.getLinkedSeniors(userId);
          if (cancelled) return;
          setLinkedSenior(seniors.length > 0 ? toLink(seniors[0]) : null);
          const code = await db.getActivePairingCode(userId);
          if (cancelled) return;
          setPairingCode(code);
        } else if (role === 'senior') {
          const caregivers = await db.getLinkedCaregivers(userId);
          if (cancelled) return;
          setLinkedCaregiver(caregivers.length > 0 ? toLink(caregivers[0]) : null);
        }
      } catch (err) {
        console.error('Error loading links for role:', err);
      }
    };

    loadLinks();
    return () => { cancelled = true; };
  }, [userId, role]);

  // ─── Derived: activeSeniorId from one-to-one link ─────────
  const activeSeniorId = linkedSenior?.seniorId ?? null;
  const activeSeniorName = linkedSenior?.seniorName ?? '';

  // ─── Load scoped data when activeSeniorId or role changes ─
  const scopedSeniorId = role === 'senior' ? userId : activeSeniorId;

  useEffect(() => {
    if (!scopedSeniorId) return;

    let cancelled = false;
    const loadScopedData = async () => {
      try {
        const [meds, well, alerts, todayLogs] = await Promise.all([
          db.getMedicines(scopedSeniorId),
          db.getLatestWellbeing(scopedSeniorId),
          db.getAlerts(scopedSeniorId),
          db.getTodayMedicineLogs(scopedSeniorId),
        ]);
        if (cancelled) return;

        const todayLogSet = new Set(todayLogs.map(l => l.medicine_id));
        setSharedMedicinesState(meds.map(m => toMedicine(m, todayLogSet)));
        setWellbeingState(well ? {
          mood: well.mood,
          painArea: well.pain_area,
          timestamp: well.created_at,
        } : null);
        setDynamicAlertsState(alerts.map(toAlert));
      } catch (err) {
        console.error('Error loading scoped data:', err);
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
      await db.updateUserRole(userId, r);
      // Fetch linked data for the new role
      if (r === 'caregiver') {
        const seniors = await db.getLinkedSeniors(userId);
        setLinkedSenior(seniors.length > 0 ? toLink(seniors[0]) : null);
        const code = await db.getActivePairingCode(userId);
        setPairingCode(code);
      } else if (r === 'senior') {
        const caregivers = await db.getLinkedCaregivers(userId);
        setLinkedCaregiver(caregivers.length > 0 ? toLink(caregivers[0]) : null);
      }
    } catch (err) {
      console.error('Error updating role:', err);
    }
  }, [userId]);

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
        const caregivers = await db.getLinkedCaregivers(userId);
        setLinkedCaregiver(caregivers.length > 0 ? toLink(caregivers[0]) : null);
      }
      return result;
    } catch (err) {
      console.error('Error linking with code:', err);
      return { success: false, error: 'Connection error' };
    }
  }, [userId, userName]);

  // ─── Set shared medicines ─────────────────────────────
  const setSharedMedicines = useCallback(async (meds: SharedMedicine[]) => {
    if (!scopedSeniorId || !userId) return;
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
        }))
      );
      // Reload all active medicines for this senior
      const allMeds = await db.getMedicines(scopedSeniorId);
      setSharedMedicinesState(allMeds.map(toMedicine));
    } catch (err) {
      console.error('Error saving medicines:', err);
    }
  }, [scopedSeniorId, userId]);

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
  const addAlert = useCallback(async (alert: Omit<AlertEntry, 'id'>) => {
    if (!scopedSeniorId) return;
    try {
      const dbAlert = await db.insertAlert(scopedSeniorId, {
        type: alert.type,
        message: alert.message,
        messageHi: alert.messageHi,
        timeLabel: alert.time,
        severity: alert.severity,
      });
      setDynamicAlertsState(prev => [toAlert(dbAlert), ...prev]);
    } catch (err) {
      console.error('Error adding alert:', err);
    }
  }, [scopedSeniorId]);

  // ─── Refresh all data ─────────────────────────────────
  const refreshData = useCallback(async () => {
    if (!userId) return;
    try {
      if (role === 'caregiver') {
        const seniors = await db.getLinkedSeniors(userId);
        setLinkedSenior(seniors.length > 0 ? toLink(seniors[0]) : null);
        const code = await db.getActivePairingCode(userId);
        setPairingCode(code);
      } else if (role === 'senior') {
        const caregivers = await db.getLinkedCaregivers(userId);
        setLinkedCaregiver(caregivers.length > 0 ? toLink(caregivers[0]) : null);
      }
      if (scopedSeniorId) {
        const [meds, well, alerts] = await Promise.all([
          db.getMedicines(scopedSeniorId),
          db.getLatestWellbeing(scopedSeniorId),
          db.getAlerts(scopedSeniorId),
        ]);
        setSharedMedicinesState(meds.map(toMedicine));
        setWellbeingState(well ? {
          mood: well.mood,
          painArea: well.pain_area,
          timestamp: well.created_at,
        } : null);
        setDynamicAlertsState(alerts.map(toAlert));
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
    }
  }, [userId, role, scopedSeniorId]);

  // ─── Reset role ───────────────────────────────────────
  const resetRole = useCallback(() => {
    setRoleState(null);
    setPairingCode(null);
    setLinkedSenior(null);
    setLinkedCaregiver(null);
    setSharedMedicinesState([]);
    setWellbeingState(null);
    setDynamicAlertsState([]);
    setMedicineHistory([]);
    initDone.current = false;
    if (userId) {
      db.updateUserRole(userId, null).catch(console.error);
    }
  }, [userId]);

  return (
    <AppContext.Provider value={{
      language, setLanguage, role, setRole, t,
      currentUserId: userId, currentUserName: userName,
      loading,
      pairingCode, generatePairingCode, linkWithCode,
      linkedSenior, linkedCaregiver,
      activeSeniorId, activeSeniorName,
      sharedMedicines, setSharedMedicines, markMedicineTaken,
      medicineHistory, loadMedicineHistory,
      wellbeing, setWellbeing,
      dynamicAlerts, addAlert,
      refreshData,
      resetRole,
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
