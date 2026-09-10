-- ============================================================
-- Migration 0004: one-time caregiver onboarding wizard.
--
-- ADDITIVE ONLY — safe to run against the live database.
-- ============================================================

-- Generic per-identity fields. Each person (senior or caregiver) has their OWN
-- row in `users` keyed by their own clerk_id (same precedent as gender/phone/
-- date_of_birth, added in migrations 0001/0003) — no conflict reusing these
-- columns for a caregiver's own row vs. a senior's row.
ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS regular_medication TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS habits TEXT;

-- Relationship is a property of the caregiver<->senior PAIR, not either identity
-- alone (multi-caregiver support means different caregivers linked to the same
-- senior can have different relationships) — lives on the link row.
ALTER TABLE caregiver_senior_links ADD COLUMN IF NOT EXISTS relationship TEXT;

-- NULL = onboarding not completed yet. This null-by-default is what makes
-- "skip but resume" work: skipping a step never writes this column, so the
-- caregiver lands back in the wizard next time Index.tsx checks.
ALTER TABLE caregiver_senior_links ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
