// Supabase Edge Function: send-reminders
//
// Invoked on a schedule (pg_cron -> pg_net, every 10-15 min — see the
// commented-out `cron.schedule` block at the bottom of
// supabase/migrations/0002_push_infrastructure.sql). For every senior with
// at least one push subscription, computes whether any of their 5 daily
// routine anchors (wake/breakfast/lunch/dinner/sleep) just came due, bundles
// whatever's actually still pending into ONE notification per anchor, and
// sends it via Web Push.
//
// Deliberately recomputes from scratch every tick rather than reading a
// precomputed schedule table — cheap at this scale, and avoids staleness
// whenever a caregiver edits the routine or a medicine's dates.
//
// Deploy: supabase functions deploy send-reminders --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
