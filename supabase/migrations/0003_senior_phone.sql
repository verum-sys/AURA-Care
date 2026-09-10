-- ============================================================
-- Migration 0003: senior's own phone number.
--
-- ADDITIVE ONLY — safe to run against the live database.
-- Used by the caregiver Home "wish to speak?" call button to open
-- the device dialer with a real number, and (separately) the emergency
-- contact number already added in migration 0001 for reference.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
