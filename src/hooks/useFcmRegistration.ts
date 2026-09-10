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

  useEffect(() => {
    PushNotifications.checkPermissions().then((status) => {
      setPermission(status.receive === 'granted' ? 'granted' : status.receive === 'denied' ? 'denied' : 'default');
    }).catch(() => {});
  }, []);

  const subscribe = useCallback(async () => {
    if (!userId) return false;

    setLoading(true);
    try {
      const status = await PushNotifications.requestPermissions();
      const granted = status.receive === 'granted';
      setPermission(granted ? 'granted' : 'denied');
      if (!granted) return false;

      const tokenPromise = new Promise<string>((resolve, reject) => {
        PushNotifications.addListener('registration', (token) => resolve(token.value));
        PushNotifications.addListener('registrationError', (err) => reject(new Error(err.error)));
      });

      await PushNotifications.register();
      const token = await tokenPromise;

      await db.saveFcmToken(userId, token);
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('useFcmRegistration: subscribe failed', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return { isSupported, permission, isSubscribed, loading, subscribe };
}
