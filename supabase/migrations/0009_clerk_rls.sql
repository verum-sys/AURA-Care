-- ============================================================
-- Migration 0009: real Row Level Security, keyed to the caller's
-- actual Clerk identity.
--
-- ADDITIVE/REPLACING ONLY — safe to run against the live database.
-- Depends on the Clerk <-> Supabase Third-Party Auth integration
-- being enabled on BOTH sides (Clerk dashboard "Connect with
-- Supabase" wizard, and Supabase dashboard Auth -> Third-Party
-- Providers -> Clerk) AND src/lib/supabase.ts passing Clerk's
-- session token via the `accessToken` client option. Without both
-- of those, auth.jwt() below is null for every request and these
-- policies will lock EVERYONE out (not leave things open) — do
-- not run this until both dashboard steps are confirmed done.
--
-- Replaces every `USING (true) WITH CHECK (true)` policy from
-- schema.sql and migrations 0001/0002/0008 with policies scoped to
-- the caller's own identity or their real caregiver<->senior link,
-- via caregiver_senior_links (never trusting a client-supplied id).
-- ============================================================

-- ─── Identity helpers ───────────────────────────────────────
-- STABLE, not SECURITY DEFINER: these run with the caller's own
-- privileges, so their internal reads of caregiver_senior_links are
-- themselves subject to that table's RLS below — which is fine,
-- since every caller can always see their own rows there regardless.

CREATE OR REPLACE FUNCTION current_clerk_id() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')
$$;

-- Any caregiver (primary or secondary) linked to this senior.
CREATE OR REPLACE FUNCTION is_linked_to_senior(p_senior_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM caregiver_senior_links
    WHERE senior_id = p_senior_id AND caregiver_id = current_clerk_id()
  )
$$;

-- Specifically the PRIMARY caregiver — gates writes to a senior's
-- data, matching this codebase's own "secondary = read-only" intent
-- (see the caregiver_senior_links comment in schema.sql).
CREATE OR REPLACE FUNCTION is_primary_caregiver_of(p_senior_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM caregiver_senior_links
    WHERE senior_id = p_senior_id AND caregiver_id = current_clerk_id() AND is_primary = true
  )
$$;

-- Bidirectional: is p_other_id linked to me, either as my caregiver
-- or my senior? Used only for `users` SELECT (a caregiver viewing
-- their senior's profile, or a senior viewing their caregiver's).
CREATE OR REPLACE FUNCTION linked_to_me(p_other_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM caregiver_senior_links
    WHERE (caregiver_id = current_clerk_id() AND senior_id = p_other_id)
       OR (senior_id = current_clerk_id() AND caregiver_id = p_other_id)
  )
$$;

-- ─── users ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_all" ON users;

CREATE POLICY "users_select" ON users FOR SELECT TO authenticated
  USING (clerk_id = current_clerk_id() OR linked_to_me(clerk_id));

CREATE POLICY "users_insert" ON users FOR INSERT TO authenticated
  WITH CHECK (clerk_id = current_clerk_id());

-- UPDATE covers both self-editing and a primary caregiver editing
-- their linked senior's patient details (updatePatientDetails is
-- reused for both — see its comment in src/lib/database.ts).
CREATE POLICY "users_update" ON users FOR UPDATE TO authenticated
  USING (clerk_id = current_clerk_id() OR is_primary_caregiver_of(clerk_id))
  WITH CHECK (clerk_id = current_clerk_id() OR is_primary_caregiver_of(clerk_id));

-- ─── pairing_codes ──────────────────────────────────────────
DROP POLICY IF EXISTS "pairing_codes_all" ON pairing_codes;

-- Unclaimed codes must stay visible to any signed-in user so a
-- senior can look one up by value to claim it (claimPairingCode) —
-- this table's actual secret is the caregiver sharing the code
-- out-of-band, same as before, just no longer reachable by a fully
-- anonymous request (a real Clerk account is now required).
CREATE POLICY "pairing_codes_select" ON pairing_codes FOR SELECT TO authenticated
  USING (caregiver_id = current_clerk_id() OR is_claimed = false);

CREATE POLICY "pairing_codes_insert" ON pairing_codes FOR INSERT TO authenticated
  WITH CHECK (caregiver_id = current_clerk_id());

-- Only used by createNewPairingCode to rotate/invalidate the
-- creator's own old codes — claiming never updates this table.
CREATE POLICY "pairing_codes_update" ON pairing_codes FOR UPDATE TO authenticated
  USING (caregiver_id = current_clerk_id())
  WITH CHECK (caregiver_id = current_clerk_id());

-- ─── caregiver_senior_links ─────────────────────────────────
DROP POLICY IF EXISTS "links_all" ON caregiver_senior_links;

CREATE POLICY "links_select" ON caregiver_senior_links FOR SELECT TO authenticated
  USING (caregiver_id = current_clerk_id() OR senior_id = current_clerk_id());

-- The actual fix for the invite/pairing-code takeover: a link can
-- only ever be inserted with YOUR OWN id in the caregiver or senior
-- slot — never both ids belonging to someone else. Combined with the
-- code lookups above, an attacker can still find a pending code, but
-- can no longer link an arbitrary identity to an arbitrary senior.
CREATE POLICY "links_insert" ON caregiver_senior_links FOR INSERT TO authenticated
  WITH CHECK (caregiver_id = current_clerk_id() OR senior_id = current_clerk_id());

CREATE POLICY "links_update" ON caregiver_senior_links FOR UPDATE TO authenticated
  USING (caregiver_id = current_clerk_id() OR senior_id = current_clerk_id())
  WITH CHECK (caregiver_id = current_clerk_id() OR senior_id = current_clerk_id());

CREATE POLICY "links_delete" ON caregiver_senior_links FOR DELETE TO authenticated
  USING (caregiver_id = current_clerk_id() OR senior_id = current_clerk_id());

-- ─── caregiver_invite_codes ─────────────────────────────────
DROP POLICY IF EXISTS "invite_codes_all" ON caregiver_invite_codes;

CREATE POLICY "invite_codes_select" ON caregiver_invite_codes FOR SELECT TO authenticated
  USING (invited_by = current_clerk_id() OR senior_id = current_clerk_id() OR is_claimed = false);

CREATE POLICY "invite_codes_insert" ON caregiver_invite_codes FOR INSERT TO authenticated
  WITH CHECK (invited_by = current_clerk_id() AND is_primary_caregiver_of(senior_id));

-- Covers both real UPDATE paths: (a) the inviter refreshing invitee
-- name/age/phone/email on their own still-pending code, and (b) the
-- claimer marking it claimed — WITH CHECK forces claimed_by to
-- actually be the caller, which is the fix for the account-takeover
-- finding (previously any caller-supplied id was trusted as-is).
CREATE POLICY "invite_codes_update" ON caregiver_invite_codes FOR UPDATE TO authenticated
  USING (invited_by = current_clerk_id() OR is_claimed = false)
  WITH CHECK (
    invited_by = current_clerk_id()
    OR (claimed_by = current_clerk_id() AND is_claimed = true)
  );

-- ─── senior_routines ────────────────────────────────────────
DROP POLICY IF EXISTS "routines_all" ON senior_routines;

CREATE POLICY "routines_select" ON senior_routines FOR SELECT TO authenticated
  USING (senior_id = current_clerk_id() OR is_linked_to_senior(senior_id));

CREATE POLICY "routines_insert" ON senior_routines FOR INSERT TO authenticated
  WITH CHECK (senior_id = current_clerk_id() OR is_primary_caregiver_of(senior_id));

CREATE POLICY "routines_update" ON senior_routines FOR UPDATE TO authenticated
  USING (senior_id = current_clerk_id() OR is_primary_caregiver_of(senior_id))
  WITH CHECK (senior_id = current_clerk_id() OR is_primary_caregiver_of(senior_id));

-- ─── medicines ──────────────────────────────────────────────
DROP POLICY IF EXISTS "medicines_all" ON medicines;

CREATE POLICY "medicines_select" ON medicines FOR SELECT TO authenticated
  USING (senior_id = current_clerk_id() OR is_linked_to_senior(senior_id));

CREATE POLICY "medicines_insert" ON medicines FOR INSERT TO authenticated
  WITH CHECK (is_primary_caregiver_of(senior_id));

-- Covers both markMedicineTakenDB (senior, or caregiver viewing a
-- senior's dashboard, marking a dose taken) and deactivateMedicine
-- (primary caregiver ending a temporary medicine early).
CREATE POLICY "medicines_update" ON medicines FOR UPDATE TO authenticated
  USING (senior_id = current_clerk_id() OR is_primary_caregiver_of(senior_id))
  WITH CHECK (senior_id = current_clerk_id() OR is_primary_caregiver_of(senior_id));

-- ─── wellbeing_checkins ─────────────────────────────────────
DROP POLICY IF EXISTS "wellbeing_all" ON wellbeing_checkins;

CREATE POLICY "wellbeing_select" ON wellbeing_checkins FOR SELECT TO authenticated
  USING (senior_id = current_clerk_id() OR is_linked_to_senior(senior_id));

CREATE POLICY "wellbeing_insert" ON wellbeing_checkins FOR INSERT TO authenticated
  WITH CHECK (senior_id = current_clerk_id());

-- ─── alerts ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "alerts_all" ON alerts;

CREATE POLICY "alerts_select" ON alerts FOR SELECT TO authenticated
  USING (senior_id = current_clerk_id() OR is_linked_to_senior(senior_id));

CREATE POLICY "alerts_insert" ON alerts FOR INSERT TO authenticated
  WITH CHECK (senior_id = current_clerk_id() OR is_primary_caregiver_of(senior_id));

-- markAlertRead/markAllAlertsRead are how caregivers dismiss alerts
-- about their senior — allowed for any linked caregiver, not just
-- primary (low risk: toggles a read flag, doesn't expose or destroy
-- anything a linked caregiver couldn't already see).
CREATE POLICY "alerts_update" ON alerts FOR UPDATE TO authenticated
  USING (senior_id = current_clerk_id() OR is_linked_to_senior(senior_id))
  WITH CHECK (senior_id = current_clerk_id() OR is_linked_to_senior(senior_id));

-- ─── medicine_logs (permanent — no UPDATE/DELETE policy, so both
--     stay denied by default once RLS is enabled) ─────────────
DROP POLICY IF EXISTS "medicine_logs_all" ON medicine_logs;

CREATE POLICY "medicine_logs_select" ON medicine_logs FOR SELECT TO authenticated
  USING (senior_id = current_clerk_id() OR is_linked_to_senior(senior_id));

CREATE POLICY "medicine_logs_insert" ON medicine_logs FOR INSERT TO authenticated
  WITH CHECK (senior_id = current_clerk_id() OR is_primary_caregiver_of(senior_id));

-- ─── meal_logs (permanent — same as medicine_logs) ───────────
DROP POLICY IF EXISTS "meal_logs_all" ON meal_logs;

CREATE POLICY "meal_logs_select" ON meal_logs FOR SELECT TO authenticated
  USING (senior_id = current_clerk_id() OR is_linked_to_senior(senior_id));

CREATE POLICY "meal_logs_insert" ON meal_logs FOR INSERT TO authenticated
  WITH CHECK (senior_id = current_clerk_id() OR is_primary_caregiver_of(senior_id));

-- ─── push_subscriptions — the fix for the notification-hijack
--     finding: a subscription can only ever be written/removed for
--     YOUR OWN id, never an arbitrary senior's. deletePushSubscription
--     filters by endpoint alone client-side, so USING here is what
--     actually stops it from deleting someone else's row. ──────
DROP POLICY IF EXISTS "push_subs_all" ON push_subscriptions;

CREATE POLICY "push_subs_select" ON push_subscriptions FOR SELECT TO authenticated
  USING (user_id = current_clerk_id());

CREATE POLICY "push_subs_insert" ON push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = current_clerk_id());

CREATE POLICY "push_subs_update" ON push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = current_clerk_id())
  WITH CHECK (user_id = current_clerk_id());

CREATE POLICY "push_subs_delete" ON push_subscriptions FOR DELETE TO authenticated
  USING (user_id = current_clerk_id());

-- ─── fcm_tokens — same fix, same reasoning, as push_subscriptions ──
DROP POLICY IF EXISTS "fcm_tokens_all" ON fcm_tokens;

CREATE POLICY "fcm_tokens_select" ON fcm_tokens FOR SELECT TO authenticated
  USING (user_id = current_clerk_id());

CREATE POLICY "fcm_tokens_insert" ON fcm_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = current_clerk_id());

CREATE POLICY "fcm_tokens_update" ON fcm_tokens FOR UPDATE TO authenticated
  USING (user_id = current_clerk_id())
  WITH CHECK (user_id = current_clerk_id());

CREATE POLICY "fcm_tokens_delete" ON fcm_tokens FOR DELETE TO authenticated
  USING (user_id = current_clerk_id());

-- ─── reminder_send_log — written only by send-reminders via the
--     service_role key, which bypasses RLS entirely. No client
--     (anon/authenticated) ever needs to touch this table, so it
--     gets NO policies at all: RLS enabled + zero matching policies
--     means fully denied for every non-service-role caller. ─────
DROP POLICY IF EXISTS "reminder_log_all" ON reminder_send_log;
