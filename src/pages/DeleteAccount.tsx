import { useState } from 'react';
import { Show, SignIn, useSession } from '@clerk/react';
import { Shield, AlertTriangle, Loader2 } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const CONFIRM_PHRASE = 'DELETE';

// Google Play requires a web-based way to request account deletion, reachable
// without reinstalling the app — this page is that resource. It signs the
// visitor into their own Kin Care account (so we know which account to
// delete) and then calls the same delete-account edge function the mobile
// and web apps' in-app "Delete Account" option calls.
const DeleteAccountConfirm = () => {
  const { session } = useSession();
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'deleting' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (!session) return;
    setStatus('deleting');
    setError('');
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId: session.id }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${resp.status}`);
      }
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  if (status === 'done') {
    return (
      <div className="text-center">
        <Shield className="w-10 h-10 text-primary mx-auto mb-3" />
        <p className="font-bold text-foreground">Your account and all associated data have been deleted.</p>
        <p className="text-sm text-muted-foreground mt-2">You can safely close this page.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-3 mb-4 p-4 rounded-xl bg-destructive/10 text-destructive">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p className="text-sm font-semibold">
          This permanently deletes your Kin Care account and all associated data — medicines, meal and
          wellbeing logs, alerts, and caregiver/senior links. This cannot be undone.
        </p>
      </div>
      <label className="text-sm font-semibold text-foreground mb-1 block">
        Type {CONFIRM_PHRASE} to confirm:
      </label>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={status === 'deleting'}
        className="w-full px-4 py-3 rounded-xl border-2 border-border bg-background text-foreground focus:border-primary focus:outline-none mb-4"
      />
      {error && <p className="text-destructive text-sm font-semibold mb-4">{error}</p>}
      <button
        type="button"
        disabled={input.trim().toUpperCase() !== CONFIRM_PHRASE || status === 'deleting'}
        onClick={handleDelete}
        className="w-full py-3 rounded-xl bg-destructive text-destructive-foreground font-bold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {status === 'deleting' && <Loader2 className="w-4 h-4 animate-spin" />}
        Permanently Delete My Account
      </button>
    </div>
  );
};

const DeleteAccount = () => (
  <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-10">
    <div className="w-full max-w-md">
      <div className="flex items-center gap-2 mb-6 justify-center">
        <Shield className="w-6 h-6 text-primary" />
        <span className="font-black text-lg text-foreground">Kin Care</span>
      </div>
      <Show when="signed-out">
        <p className="text-center text-sm text-muted-foreground mb-4">
          Sign in to the account you want to delete.
        </p>
        <div className="flex justify-center">
          <SignIn routing="hash" fallbackRedirectUrl="/delete-account" />
        </div>
      </Show>
      <Show when="signed-in">
        <div className="glass-card rounded-2xl p-6">
          <DeleteAccountConfirm />
        </div>
      </Show>
    </div>
  </div>
);

export default DeleteAccount;
