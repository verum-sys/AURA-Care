import { useCallback, useEffect, useState } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import * as db from '@/lib/database';

/**
 * Native counterpart to usePushSubscription — same shape (isSupported,
 * permission, isSubscribed, loading, subscribe) so PushOptInBanner can use
 * either interchangeably. WebView can't receive Web Push in the background
 * at all, so the packaged app registers with FCM directly instead; the web
 * app keeps using Web Push (usePushSubscription) unchanged.
 */
export function useFcmRegistration(userId: string | null) {
  const isSupported = true; // only mounted on native — see PushOptInBanner

  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  const register = useCallback(async (): Promise<string | null> => {
    const tokenPromise = new Promise<string>((resolve, reject) => {
      PushNotifications.addListener('registration', (token) => resolve(token.value));
      PushNotifications.addListener('registrationError', (err) => reject(new Error(err.error)));
    });
    await PushNotifications.register();
    return tokenPromise;
  }, []);

  // If permission was already granted in a previous session, silently
  // re-register on every app start instead of waiting for a banner tap —
  // this is what keeps the token alive across app updates/reinstalls, and
  // is also what makes the "Enable Reminders" banner correctly stay hidden
  // instead of reappearing on every launch even though notifications are
  // already on.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    PushNotifications.checkPermissions().then(async (status) => {
      if (cancelled) return;
      const granted = status.receive === 'granted';
      setPermission(granted ? 'granted' : status.receive === 'denied' ? 'denied' : 'default');
      if (!granted) return;

      try {
        const token = await register();
        if (cancelled || !token) return;
        await db.saveFcmToken(userId, token);
        setIsSubscribed(true);
      } catch (err) {
        console.error('useFcmRegistration: silent refresh failed', err);
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [userId, register]);

  const subscribe = useCallback(async () => {
    if (!userId) return false;

    setLoading(true);
    try {
      const status = await PushNotifications.requestPermissions();
      const granted = status.receive === 'granted';
      setPermission(granted ? 'granted' : 'denied');
      if (!granted) return false;

      const token = await register();
      if (!token) return false;

      await db.saveFcmToken(userId, token);
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('useFcmRegistration: subscribe failed', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [userId, register]);

  return { isSupported, permission, isSubscribed, loading, subscribe };
}
