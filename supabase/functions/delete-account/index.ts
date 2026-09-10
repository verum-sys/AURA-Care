// Supabase Edge Function: delete-account
//
// Google Play requires apps that support account creation to also offer an
// in-app AND a web-based way to delete the account and its data (Play
// Console > User Data policy > Account Deletion). Both the Flutter app and
// the web app's /delete-account page call this same function so there is
// exactly one deletion code path to keep correct.
//
// The caller proves who they are with their own Clerk session id (never a
// secret) — this function verifies that session against Clerk's Backend API
// using CLERK_SECRET_KEY (server-side only) before deleting anything.
//
// Deleting the `users` row cascades (ON DELETE CASCADE, see schema.sql) to
// every other table keyed on clerk_id: pairing_codes, caregiver_senior_links,
// caregiver_invite_codes, senior_routines, medicines (+ medicine_logs),
// wellbeing_checkins, alerts, meal_logs, push_subscriptions, fcm_tokens,
// reminder_send_log. The Clerk account itself is deleted last, after the
// Supabase data is confirmed gone, so a failed Clerk call never leaves an
// orphaned Supabase row with the app data.
//
// Deploy: supabase functions deploy delete-account --project-ref ounifpinkqybkydxuvbq
// Secrets: supabase secrets set CLERK_SECRET_KEY=... --project-ref ounifpinkqybkydxuvbq
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase.)

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLERK_SECRET_KEY = Deno.env.get('CLERK_SECRET_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let sessionId: string | undefined;
  try {
    ({ sessionId } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!sessionId) return json({ error: 'Missing sessionId' }, 400);

  // Verify the session belongs to a real, currently-active Clerk sign-in —
  // this is what stops anyone from deleting an arbitrary account by guessing
  // a user id.
  const sessionResp = await fetch(`https://api.clerk.com/v1/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (!sessionResp.ok) return json({ error: 'Invalid or expired session' }, 401);
  const session = await sessionResp.json();
  if (session.status !== 'active') return json({ error: 'Session is not active' }, 401);

  const userId = session.user_id as string;

  const { error: dbError } = await supabase.from('users').delete().eq('clerk_id', userId);
  if (dbError) return json({ error: `Failed to delete app data: ${dbError.message}` }, 500);

  const clerkDelResp = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (!clerkDelResp.ok) {
    const errText = await clerkDelResp.text();
    // App data is already gone at this point; surface the failure so the
    // caller can retry the Clerk deletion rather than silently leaving the
    // login account behind.
    return json({ error: `App data deleted, but Clerk account deletion failed: ${errText}` }, 500);
  }

  return json({ success: true });
});
