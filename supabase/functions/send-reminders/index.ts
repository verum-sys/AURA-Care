// Supabase Edge Function: send-reminders
//
// Invoked on a schedule (pg_cron -> pg_net every 10 min — see migration
// 0010). For every senior with at least one push subscription (Web Push) or
// FCM token (native app), computes what's ACTUALLY still pending right now
// — mood not logged today, each meal whose routine time has passed and
// isn't logged, each medicine dose whose scheduled time has passed and
// isn't logged (same rule DailyCheckIn.tsx uses in-app, reimplemented here
// since an edge function can't share client code) — and sends ONE push
// listing all of it. Nothing hardcoded to "ask about dinner" or any fixed
// clock bucket: what's asked is purely a function of what's still open.
//
// Send timing: quiet outside [wake, sleep) — never pings at 3am. Within
// that window, sends when the pending set changes (something new just
// became overdue) or every ~2h while anything remains pending, whichever
// comes first — reminder_state tracks the last-sent signature/time per
// senior so this doesn't spam on every 10-minute tick.
//
// Deploy: supabase functions deploy send-reminders --no-verify-jwt --import-map supabase/functions/deno.json
// Secrets:
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
//   supabase secrets set FCM_SERVICE_ACCOUNT_JSON='<contents of the Firebase service account key file>'
// Both are optional independently — whichever is missing just has its sends
// silently skipped, so e.g. FCM-only senior devices still get reminders
// even before VAPID is configured, and vice versa.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const FCM_SERVICE_ACCOUNT_JSON = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');

const vapidConfigured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (vapidConfigured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── FCM (native app) ──────────────────────────────────────
//
// HTTP v1 API, authenticated via a service-account JWT exchanged for a
// short-lived OAuth2 access token — no external JWT library needed, Deno's
// built-in Web Crypto does RS256 signing directly. The access token is
// cached at module scope so a warm isolate reuses it across cron ticks
// instead of re-authenticating on every single send.

interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const fcmAccount: FcmServiceAccount | null = FCM_SERVICE_ACCOUNT_JSON
  ? JSON.parse(FCM_SERVICE_ACCOUNT_JSON)
  : null;

let cachedFcmToken: { token: string; expiresAt: number } | null = null;

function base64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getFcmAccessToken(): Promise<string | null> {
  if (!fcmAccount) return null;
  if (cachedFcmToken && cachedFcmToken.expiresAt > Date.now() + 60_000) return cachedFcmToken.token;

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify({
    iss: fcmAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))}`;

  const pemBody = fcmAccount.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(signature)}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!resp.ok) {
    console.error('FCM token exchange failed:', await resp.text());
    return null;
  }
  const json = (await resp.json()) as { access_token: string; expires_in: number };
  cachedFcmToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function sendFcmToSenior(seniorId: string, message: { title: string; body: string }) {
  const accessToken = await getFcmAccessToken();
  if (!accessToken || !fcmAccount) return; // not configured yet — Web Push subscribers still get theirs

  const { data: tokens } = await supabase.from('fcm_tokens').select('token').eq('user_id', seniorId);

  for (const { token } of (tokens ?? []) as { token: string }[]) {
    try {
      const resp = await fetch(`https://fcm.googleapis.com/v1/projects/${fcmAccount.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: { url: '/senior/checkin' },
          },
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        if (resp.status === 404 || errText.includes('UNREGISTERED')) {
          await supabase.from('fcm_tokens').delete().eq('token', token);
        } else {
          console.error(`FCM send failed for ${seniorId}:`, errText);
        }
      }
    } catch (err) {
      console.error(`FCM send threw for ${seniorId}:`, err);
    }
  }
}

interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendToSenior(seniorId: string, message: { title: string; body: string }) {
  if (vapidConfigured) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', seniorId);

    for (const sub of (subs ?? []) as PushSub[]) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: message.title, body: message.body, url: '/senior/checkin' })
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } else {
          console.error(`Push send failed for ${seniorId}:`, err);
        }
      }
    }
  }

  await sendFcmToSenior(seniorId, message);
}

// ─── Pending-items computation ─────────────────────────────
// Mirrors DailyCheckIn.tsx's queue-building logic client-side — kept in
// sync deliberately, not shared code (Deno edge function vs. Vite/React).

type MealType = 'breakfast' | 'lunch' | 'dinner';
const MEAL_LABEL: Record<MealType, string> = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner' };

interface Routine {
  senior_id: string;
  wake_time: string;
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  sleep_time: string;
}

interface Medicine {
  id: string;
  name: string;
  timing: string;
  before_after_food: 'before' | 'after' | 'with' | 'any';
  duration_type: 'permanent' | 'temporary';
  start_date: string;
  end_date: string | null;
}

const DEFAULT_ROUTINE_FALLBACK = {
  wake_time: '07:00',
  breakfast_time: '08:00',
  lunch_time: '13:00',
  dinner_time: '20:00',
  sleep_time: '22:00',
};

function timeStrToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Hardcoded IST (UTC+5:30) — matches this app's India-only scope, per the plan.
function nowInIST(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 5.5 * 60 * 60 * 1000);
}

interface PendingItem {
  key: string; // stable identity for the signature — e.g. "meal:lunch", "med:<id>:13:00", "mood"
  label: string; // human-readable, used in the composed message
}

function computePendingItems(opts: {
  routine: Routine;
  medicines: Medicine[];
  loggedSlots: Set<string>; // `${medicine_id}|${slot}`
  loggedMeals: Set<MealType>;
  moodAnsweredToday: boolean;
  nowMinutes: number;
  todayStr: string;
}): PendingItem[] {
  const { routine, medicines, loggedSlots, loggedMeals, moodAnsweredToday, nowMinutes, todayStr } = opts;
  const items: PendingItem[] = [];

  if (!moodAnsweredToday) items.push({ key: 'mood', label: 'how you are feeling' });

  const activeMeds = medicines.filter((m) => {
    if (m.duration_type === 'permanent') return true;
    return m.start_date <= todayStr && (!m.end_date || m.end_date >= todayStr);
  });

  for (const med of activeMeds) {
    const slots = med.timing.split(',').map((s) => s.trim()).filter(Boolean);
    for (const slot of slots) {
      const minutes = timeStrToMinutes(slot);
      if (minutes > nowMinutes) continue; // not due yet
      if (loggedSlots.has(`${med.id}|${slot}`)) continue; // already answered
      items.push({ key: `med:${med.id}:${slot}`, label: `${med.name} (${slot})` });
    }
  }

  const mealAnchors: [MealType, string][] = [
    ['breakfast', routine.breakfast_time],
    ['lunch', routine.lunch_time],
    ['dinner', routine.dinner_time],
  ];
  for (const [meal, timeStr] of mealAnchors) {
    const minutes = timeStrToMinutes(timeStr);
    if (minutes > nowMinutes) continue;
    if (loggedMeals.has(meal)) continue;
    items.push({ key: `meal:${meal}`, label: MEAL_LABEL[meal] });
  }

  return items;
}

function composeMessage(items: PendingItem[]): { title: string; body: string } {
  const meals = items.filter((i) => i.key.startsWith('meal:')).map((i) => i.label);
  const meds = items.filter((i) => i.key.startsWith('med:')).map((i) => i.label);
  const mood = items.some((i) => i.key === 'mood');

  const parts: string[] = [];
  if (meals.length > 0) parts.push(meals.join(', '));
  if (meds.length > 0) parts.push(meds.join(', '));

  let body = parts.length > 0 ? `Still pending today: ${parts.join('; ')}.` : '';
  if (mood) body += (body ? ' ' : '') + 'How are you feeling today?';

  return { title: 'Kin Care reminder', body: body.trim() };
}

const RENAG_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

Deno.serve(async () => {
  const ist = nowInIST();
  const nowMinutes = ist.getHours() * 60 + ist.getMinutes();
  const todayStr = ist.toISOString().slice(0, 10);

  const [{ data: subRows }, { data: tokenRows }] = await Promise.all([
    supabase.from('push_subscriptions').select('user_id'),
    supabase.from('fcm_tokens').select('user_id'),
  ]);
  const seniorIds = [...new Set([
    ...(subRows ?? []).map((r) => r.user_id as string),
    ...(tokenRows ?? []).map((r) => r.user_id as string),
  ])];

  let sent = 0;
  let skipped = 0;

  for (const seniorId of seniorIds) {
    const [{ data: routineRow }, { data: meds }, { data: mealLogs }, { data: slotLogs }, { data: moodRows }, { data: state }] =
      await Promise.all([
        supabase.from('senior_routines').select('*').eq('senior_id', seniorId).maybeSingle(),
        supabase.from('medicines').select('*').eq('senior_id', seniorId).eq('is_active', true),
        supabase.from('meal_logs').select('meal_type').eq('senior_id', seniorId).eq('log_date', todayStr),
        supabase.from('medicine_logs').select('medicine_id, slot').eq('senior_id', seniorId).eq('taken_date', todayStr),
        supabase.from('wellbeing_checkins').select('id').eq('senior_id', seniorId).gte('created_at', `${todayStr}T00:00:00Z`).limit(1),
        supabase.from('reminder_state').select('*').eq('senior_id', seniorId).maybeSingle(),
      ]);

    const routine: Routine = {
      senior_id: seniorId,
      wake_time: routineRow?.wake_time ?? DEFAULT_ROUTINE_FALLBACK.wake_time,
      breakfast_time: routineRow?.breakfast_time ?? DEFAULT_ROUTINE_FALLBACK.breakfast_time,
      lunch_time: routineRow?.lunch_time ?? DEFAULT_ROUTINE_FALLBACK.lunch_time,
      dinner_time: routineRow?.dinner_time ?? DEFAULT_ROUTINE_FALLBACK.dinner_time,
      sleep_time: routineRow?.sleep_time ?? DEFAULT_ROUTINE_FALLBACK.sleep_time,
    };

    // Quiet hours — never ping outside the senior's own wake/sleep window.
    const wakeMinutes = timeStrToMinutes(routine.wake_time);
    const sleepMinutes = timeStrToMinutes(routine.sleep_time);
    const inQuietHours = sleepMinutes > wakeMinutes
      ? (nowMinutes < wakeMinutes || nowMinutes >= sleepMinutes)
      : (nowMinutes < wakeMinutes && nowMinutes >= sleepMinutes); // overnight sleep window edge case
    if (inQuietHours) { skipped++; continue; }

    const items = computePendingItems({
      routine,
      medicines: (meds ?? []) as Medicine[],
      loggedSlots: new Set((slotLogs ?? []).map((l) => `${l.medicine_id}|${l.slot}`)),
      loggedMeals: new Set((mealLogs ?? []).map((l) => l.meal_type as MealType)),
      moodAnsweredToday: (moodRows ?? []).length > 0,
      nowMinutes,
      todayStr,
    });

    if (items.length === 0) { skipped++; continue; }

    const signature = items.map((i) => i.key).sort().join(',');
    const lastSentAt = state?.last_sent_at ? new Date(state.last_sent_at).getTime() : null;
    const shouldSend =
      !state ||
      signature !== state.last_signature ||
      !lastSentAt ||
      Date.now() - lastSentAt >= RENAG_INTERVAL_MS;

    if (!shouldSend) { skipped++; continue; }

    const message = composeMessage(items);
    await sendToSenior(seniorId, message);

    await supabase.from('reminder_state').upsert({
      senior_id: seniorId,
      last_sent_at: new Date().toISOString(),
      last_signature: signature,
    });
    await supabase.from('reminder_send_log').insert({
      senior_id: seniorId,
      send_date: todayStr,
      payload_summary: message.body,
    });

    sent++;
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped, seniors: seniorIds.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
