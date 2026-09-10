-- ============================================================
-- Migration 0001: multi-caregiver, senior routine, patient
-- details, permanent/temporary medicines.
--
-- ADDITIVE ONLY — safe to run against the live database.
-- Unlike schema.sql (which drops and recreates everything),
-- this migration is designed to be pasted into the Supabase
-- SQL editor and run once, without touching existing data.
-- ============================================================

-- ─── Multi-caregiver: relax 1:1, add primary/secondary tier ──
ALTER TABLE caregiver_senior_links DROP CONSTRAINT IF EXISTS caregiver_senior_links_senior_id_key;
ALTER TABLE caregiver_senior_links ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_primary_per_senior
  ON caregiver_senior_links(senior_id) WHERE is_primary = true;

-- caregiver_id stays UNIQUE — a caregiver (primary or secondary) still has exactly one senior.

-- Secondary-caregiver invite links are created via caregiver_invite_codes (below), not
-- pairing_codes, so `code` can no longer be a required FK into pairing_codes.
ALTER TABLE caregiver_senior_links ALTER COLUMN code DROP NOT NULL;
ALTER TABLE caregiver_senior_links DROP CONSTRAINT IF EXISTS caregiver_senior_links_code_fkey;

-- ─── Secondary-caregiver invite codes ──────────────────────
-- Separate from pairing_codes: pairing codes create a NEW senior identity + primary link;
-- invite codes attach a NEW caregiver to an EXISTING senior_id as non-primary.
CREATE TABLE IF NOT EXISTS caregiver_invite_codes (
  code         TEXT PRIMARY KEY,
  senior_id    TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE,
  senior_name  TEXT NOT NULL DEFAULT 'Senior',
  invited_by   TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE,
  is_claimed   BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_by   TEXT REFERENCES users(clerk_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_codes_senior ON caregiver_invite_codes(senior_id);

ALTER TABLE caregiver_invite_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invite_codes_all" ON caregiver_invite_codes;
CREATE POLICY "invite_codes_all" ON caregiver_invite_codes FOR ALL USING (true) WITH CHECK (true);

-- ─── Senior daily routine ───────────────────────────────────
-- One row per senior. Drives reminder scheduling (Phase 2). Primary-caregiver-editable.
CREATE TABLE IF NOT EXISTS senior_routines (
  senior_id      TEXT PRIMARY KEY REFERENCES users(clerk_id) ON DELETE CASCADE,
  wake_time      TIME NOT NULL DEFAULT '07:00',
  breakfast_time TIME NOT NULL DEFAULT '08:00',
  lunch_time     TIME NOT NULL DEFAULT '13:00',
  dinner_time    TIME NOT NULL DEFAULT '20:00',
  sleep_time     TIME NOT NULL DEFAULT '22:00',
  updated_by     TEXT REFERENCES users(clerk_id) ON DELETE SET NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_senior_routines_updated_at ON senior_routines;
CREATE TRIGGER trg_senior_routines_updated_at
  BEFORE UPDATE ON senior_routines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE senior_routines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "routines_all" ON senior_routines;
CREATE POLICY "routines_all" ON senior_routines FOR ALL USING (true) WITH CHECK (true);

-- ─── Patient details ────────────────────────────────────────
-- Additive nullable columns on users (only meaningful for role='senior').
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS known_conditions TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─── Medicines: permanent/temporary + reminder-derivation field ──
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS duration_type TEXT NOT NULL DEFAULT 'permanent'
  CHECK (duration_type IN ('permanent', 'temporary'));
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS start_date DATE;
UPDATE medicines SET start_date = created_at::date WHERE start_date IS NULL;
ALTER TABLE medicines ALTER COLUMN start_date SET DEFAULT CURRENT_DATE;
ALTER TABLE medicines ALTER COLUMN start_date SET NOT NULL;
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS end_date DATE; -- NULL = no end / permanent
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS times_per_day INTEGER;

-- Best-effort backfill so existing rows aren't silently excluded from reminder scheduling.
UPDATE medicines
SET times_per_day = GREATEST(1, array_length(string_to_array(timing, ','), 1))
WHERE times_per_day IS NULL AND timing IS NOT NULL AND timing <> '';

UPDATE medicines SET times_per_day = 1 WHERE times_per_day IS NULL;
ALTER TABLE medicines ALTER COLUMN times_per_day SET DEFAULT 1;
ALTER TABLE medicines ALTER COLUMN times_per_day SET NOT NULL;
