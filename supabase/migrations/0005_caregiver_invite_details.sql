-- ============================================================
-- Migration 0005: invitee details on secondary-caregiver invites.
--
-- ADDITIVE ONLY — safe to run against the live database.
--
-- Lets the inviting caregiver name who they're inviting (before that person
-- has signed up at all) so the invite can be personalized and shown as a
-- "pending" entry on the Care Team page, and so the WhatsApp share message
-- knows which number to send to.
-- ============================================================

ALTER TABLE caregiver_invite_codes ADD COLUMN IF NOT EXISTS invitee_name TEXT;
ALTER TABLE caregiver_invite_codes ADD COLUMN IF NOT EXISTS invitee_age INTEGER;
ALTER TABLE caregiver_invite_codes ADD COLUMN IF NOT EXISTS invitee_phone TEXT;
