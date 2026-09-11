-- ============================================================
-- Migration 0010: per-dose medicine tracking + activate the
-- reminder cron job.
--
-- ADDITIVE ONLY — safe to run against the live database.
--
-- 1. medicine_logs gains a `slot` column so a medicine taken twice a
--    day (e.g. 13:00 and 17:00) can be logged and asked about as two
--    separate doses instead of one "taken today" flag. Existing rows
--    get slot = '' and keep working exactly as before — nothing that
--    already reads/writes medicine_logs without a slot breaks.
-- 2. Actually schedules supabase/functions/send-reminders, which was
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
