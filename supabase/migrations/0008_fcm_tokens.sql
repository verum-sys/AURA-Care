-- ============================================================
-- Migration 0008: FCM token storage for the packaged native app.
--
-- ADDITIVE ONLY — safe to run against the live database.
--
-- push_subscriptions (0002) holds Web Push subscriptions for browser
-- users — endpoint/p256dh/auth don't make sense for FCM, which is just
-- one opaque device token, so this is a separate table rather than
-- nullable columns bolted onto push_subscriptions. send-reminders reads
-- both tables for a given senior and sends via whichever exist.
-- ============================================================

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(clerk_id) ON DELETE CASCADE, -- the senior's id
  token       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id);

ALTER TABLE fcm_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fcm_tokens_all" ON fcm_tokens;
CREATE POLICY "fcm_tokens_all" ON fcm_tokens FOR ALL USING (true) WITH CHECK (true);
