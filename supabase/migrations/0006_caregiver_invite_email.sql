-- ============================================================
-- Migration 0006: invitee email on secondary-caregiver invites.
--
-- ADDITIVE ONLY — safe to run against the live database.
--
-- Lets the inviting caregiver reach the person they're inviting by email
-- (a mailto: compose, same idea as the existing WhatsApp share) in addition
-- to WhatsApp/phone.
-- ============================================================

ALTER TABLE caregiver_invite_codes ADD COLUMN IF NOT EXISTS invitee_email TEXT;
