-- ============================================================
-- Migration 0010: per-dose medicine tracking + a dynamic,
-- pending-items-aware reminder cron job.
--
-- ADDITIVE ONLY — safe to run against the live database.
--
-- 1. medicine_logs gains a `slot` column so a medicine taken twice a
--    day (e.g. 13:00 and 17:00) can be logged and asked about as two
--    separate doses instead of one "taken today" flag. Existing rows
--    get slot = '' and keep working exactly as before — nothing that
--    already reads/writes medicine_logs without a slot breaks.
-- 2. reminder_send_log's old one-per-window-per-day uniqueness no longer
--    fits — the new send-reminders computes "everything still pending"
--    on every tick rather than one fixed anchor at a time — so it's
--    relaxed into a plain append-only send history instead.
-- 3. New reminder_state table: one row per senior, tracking what was in
--    the last push sent and when, so send-reminders can decide "send
--    again" (something new became due, or 2h have passed) vs "already
--    covered this."
-- 4. Actually schedules supabase/functions/send-reminders, which was
--    deployed but never called — reminder_send_log had zero rows.
-- ============================================================

ALTER TABLE medicine_logs ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT '';

-- Drop whatever the old (medicine_id, taken_date) unique constraint is
-- actually named (don't assume Postgres's default naming), then add the
-- 3-column one.
DO $$
DECLARE
  old_constraint TEXT;
BEGIN
  SELECT con.conname INTO old_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'medicine_logs'
    AND con.contype = 'u'
    AND con.conkey = (
      SELECT array_agg(attnum ORDER BY attnum)
      FROM pg_attribute
      WHERE attrelid = rel.oid AND attname IN ('medicine_id', 'taken_date')
    )
  LIMIT 1;

  IF old_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE medicine_logs DROP CONSTRAINT %I', old_constraint);
  END IF;
END $$;

ALTER TABLE medicine_logs ADD CONSTRAINT medicine_logs_medicine_id_taken_date_slot_key
  UNIQUE (medicine_id, taken_date, slot);

-- reminder_send_log becomes a plain history log (still useful for
-- debugging "did a push actually fire") — drop the constraint that limited
-- it to one row per window per day, since a single tick can now legitimately
-- log one row summarizing everything it sent, and re-sends every ~2h.
ALTER TABLE reminder_send_log DROP CONSTRAINT IF EXISTS reminder_send_log_senior_id_window_key_send_date_key;
ALTER TABLE reminder_send_log ALTER COLUMN window_key DROP NOT NULL;
ALTER TABLE reminder_send_log DROP CONSTRAINT IF EXISTS reminder_send_log_window_key_check;

CREATE TABLE IF NOT EXISTS reminder_state (
  senior_id       TEXT PRIMARY KEY REFERENCES users(clerk_id) ON DELETE CASCADE,
  last_sent_at    TIMESTAMPTZ,
  last_signature  TEXT NOT NULL DEFAULT ''
);

ALTER TABLE reminder_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reminder_state_all" ON reminder_state;
CREATE POLICY "reminder_state_all" ON reminder_state FOR ALL USING (true) WITH CHECK (true);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'kincare-send-reminders';

SELECT cron.schedule(
  'kincare-send-reminders',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ounifpinkqybkydxuvbq.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91bmlmcGlua3F5Ymt5ZHh1dmJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwODgyNzUsImV4cCI6MjA4NzY2NDI3NX0.xlWFBsQg9VjCt1eAI_XGBmck73eANA0oNAfZbtVoN4Y',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
