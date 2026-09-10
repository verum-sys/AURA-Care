import { describe, it, expect, afterAll } from 'vitest';
import { supabase } from './supabase';
import { createPairingCode, claimPairingCode } from './database';

// Regression test for the self-pairing bug: switching role on the same
// account (generate a code as caregiver, then enter it as senior) used to
// create a caregiver_senior_links row where caregiver_id === senior_id,
// tangling all of that account's data together regardless of role.
describe('claimPairingCode', () => {
  const testUserId = `test_self_pair_${Date.now()}`;

  afterAll(async () => {
    await supabase.from('users').delete().eq('clerk_id', testUserId);
  });

  it('rejects a code claimed by the same account that generated it', async () => {
    const code = await createPairingCode(testUserId, 'Test User');

    const result = await claimPairingCode(code, testUserId, 'Test User');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/cannot pair with yourself/i);

    const { data: link } = await supabase
      .from('caregiver_senior_links')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    expect(link).toBeNull();
  });
});
