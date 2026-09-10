-- ============================================================
-- Migration 0007: server-side alerts (pg_cron).
--
-- ADDITIVE ONLY — safe to run against the live database.
--
-- Until now alerts were only raised inside an open browser tab. This moves
-- generation into Postgres so they fire even when nobody has the app open.
-- All times are IST — the app's only market.
-- ============================================================

-- 1. Dedupe key. Lets the browser fallback and the cron job both attempt
--    the same alert; only the first lands. NULL for one-off alerts
--    (distress etc.) — NULLs never collide in a unique index.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_dedupe ON alerts(senior_id, dedupe_key);

-- 2. The generator. Only seniors with a linked caregiver are considered —
--    alerts have no audience otherwise.
CREATE OR REPLACE FUNCTION generate_alerts() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_now   timestamp := (now() AT TIME ZONE 'Asia/Kolkata');
  v_today date      := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_label text      := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM');
BEGIN
  -- a) A medicine not logged within 60 minutes of its due time. Due time is
  --    the first clock time in its timing text (e.g. "08:00, 20:00"), else
  --    the routine's breakfast time, else 8 AM. medicine_logs holds one row
  --    per medicine per day, so this catches the first missed dose of the day.
  INSERT INTO alerts (senior_id, type, message, message_hi, time_label, severity, dedupe_key)
  SELECT m.senior_id, 'medication',
         format('%s has not taken %s yet (due %s)',
                split_part(u.name, ' ', 1), m.name, to_char(v_today + due.t, 'HH12:MI AM')),
         format('%s ने अभी तक %s नहीं ली (समय %s)',
                split_part(u.name, ' ', 1), coalesce(nullif(m.name_hi, ''), m.name), to_char(v_today + due.t, 'HH12:MI AM')),
         v_label, 'warning',
         format('missed:%s:%s', m.id, v_today)
  FROM medicines m
  JOIN users u ON u.clerk_id = m.senior_id
  JOIN (SELECT DISTINCT senior_id FROM caregiver_senior_links) linked ON linked.senior_id = m.senior_id
  LEFT JOIN senior_routines r ON r.senior_id = m.senior_id
  CROSS JOIN LATERAL (
    SELECT coalesce(
      substring(m.timing FROM '(?:[01]?\d|2[0-3]):[0-5]\d')::time,
      r.breakfast_time,
      time '08:00'
    ) AS t
  ) due
  WHERE m.is_active
    AND m.start_date <= v_today
    AND (m.end_date IS NULL OR m.end_date >= v_today)
    AND v_now::time >= due.t + interval '60 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM medicine_logs l
      WHERE l.medicine_id = m.id
        AND (l.taken_at AT TIME ZONE 'Asia/Kolkata')::date = v_today
    )
  ON CONFLICT (senior_id, dedupe_key) DO NOTHING;

  -- b) Nothing taken at all by 6 PM — the critical end-of-day summary. Same
  --    dedupe key as the browser fallback in AppContext, so they never double up.
  IF v_now::time >= time '18:00' THEN
    INSERT INTO alerts (senior_id, type, message, message_hi, time_label, severity, dedupe_key)
    SELECT linked.senior_id, 'medication',
           'No medicines have been taken today. Please check on your loved one.',
           'आज कोई भी दवाई नहीं ली गई है। कृपया अपनों की जाँच करें।',
           v_label, 'critical', format('nomed:%s', v_today)
    FROM (SELECT DISTINCT senior_id FROM caregiver_senior_links) linked
    WHERE EXISTS (
        SELECT 1 FROM medicines m
        WHERE m.senior_id = linked.senior_id AND m.is_active
          AND m.start_date <= v_today AND (m.end_date IS NULL OR m.end_date >= v_today))
      AND NOT EXISTS (
        SELECT 1 FROM medicine_logs l
        WHERE l.senior_id = linked.senior_id
          AND (l.taken_at AT TIME ZONE 'Asia/Kolkata')::date = v_today)
    ON CONFLICT (senior_id, dedupe_key) DO NOTHING;
  END IF;

  -- c) No check-in 3 hours after wake time (8 AM if no routine is set).
  INSERT INTO alerts (senior_id, type, message, message_hi, time_label, severity, dedupe_key)
  SELECT linked.senior_id, 'inactivity',
         format('No check-in from %s yet today', split_part(u.name, ' ', 1)),
         format('%s से आज अभी तक कोई चेक-इन नहीं', split_part(u.name, ' ', 1)),
         v_label, 'warning', format('inactivity:%s', v_today)
  FROM (SELECT DISTINCT senior_id FROM caregiver_senior_links) linked
  JOIN users u ON u.clerk_id = linked.senior_id
  LEFT JOIN senior_routines r ON r.senior_id = linked.senior_id
  WHERE v_now::time >= coalesce(r.wake_time, time '08:00') + interval '3 hours'
    AND NOT EXISTS (
      SELECT 1 FROM wellbeing_checkins w
      WHERE w.senior_id = linked.senior_id
        AND (w.created_at AT TIME ZONE 'Asia/Kolkata')::date = v_today)
  ON CONFLICT (senior_id, dedupe_key) DO NOTHING;
END;
$$;

-- 3. Run it every 15 minutes. Re-running this block just updates the job.
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
SELECT cron.schedule('kincare-generate-alerts', '*/15 * * * *', 'SELECT generate_alerts()');
