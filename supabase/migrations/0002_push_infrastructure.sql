-- ============================================================
-- Migration 0002: Web Push infrastructure.
--
-- ADDITIVE ONLY — safe to run against the live database.
-- Depends on 0001 (senior_routines, medicines.times_per_day/
-- duration_type) already being applied — the reminder logic in
-- supabase/functions/send-reminders reads that data.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE, -- the senior's id
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- Dedup so the same reminder window never fires twice in one day even if
-- overlapping cron ticks race each other. INSERT ... ON CONFLICT DO NOTHING
-- RETURNING id is the atomic "claim this window" operation the Edge
-- Function uses before it actually sends anything.
CREATE TABLE IF NOT EXISTS reminder_send_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  senior_id       TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE,
  window_key      TEXT NOT NULL CHECK (window_key IN ('wake', 'breakfast', 'lunch', 'dinner', 'sleep')),
  send_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_summary TEXT NOT NULL DEFAULT '',
  UNIQUE(senior_id, window_key, send_date)
);

CREATE INDEX IF NOT EXISTS idx_reminder_log_senior_date ON reminder_send_log(senior_id, send_date DESC);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subs_all" ON push_subscriptions;
CREATE POLICY "push_subs_all" ON push_subscriptions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "reminder_log_all" ON reminder_send_log;
CREATE POLICY "reminder_log_all" ON reminder_send_log FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- pg_cron / pg_net setup — run these separately (may require the
-- Supabase Dashboard, since enabling extensions typically needs
-- elevated privileges beyond what a pasted SQL script assumes).
-- ============================================================
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'send-reminders-every-10-min',
--   '*/10 * * * *',
--   $$
--   select net.http_post(
--     url := '<https://YOUR_PROJECT_REF>.functions.supabase.co/send-reminders',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <YOUR_ANON_OR_SERVICE_ROLE_KEY>',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
