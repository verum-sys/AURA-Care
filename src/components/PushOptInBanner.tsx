import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useApp } from '@/context/AppContext';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { useFcmRegistration } from '@/hooks/useFcmRegistration';
import { toast } from '@/hooks/use-toast';

const DISMISS_KEY = 'kincare_push_banner_dismissed';

// Senior-facing opt-in card for real background reminders. The packaged
// native app can't receive Web Push in the background at all (WebView
// limitation), so it registers with FCM instead — same UI either way, just
// a different hook backing it depending on platform.
const PushOptInBanner = () => {
  const { t, currentUserId } = useApp();
  const isNative = Capacitor.isNativePlatform();
  const webPush = usePushSubscription(currentUserId);
  const fcm = useFcmRegistration(currentUserId);
  const { isSupported, permission, isSubscribed, loading, subscribe } = isNative ? fcm : webPush;
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');

  if (!isSupported || isSubscribed || permission === 'denied' || dismissed) return null;

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) {
      toast({ title: t('Reminders enabled!', 'याद दिलाना चालू हो गया!') });
    } else {
      toast({ title: t("Couldn't enable reminders", 'याद दिलाना चालू नहीं हो सका'), variant: 'destructive' });
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="glass-card rounded-2xl p-4 flex items-start gap-3 animate-slide-up">
      <div className="stat-icon-bg bg-primary/10 flex-shrink-0">
        <Bell className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-foreground">{t('Turn on reminders', 'याद दिलाना चालू करें')}</p>
        <p className="text-xs text-muted-foreground font-semibold mt-0.5 mb-2">
          {t(
            'Get gently reminded about medicines and meals, even when the app is closed.',
            'दवाई और भोजन की याद पाएं, भले ही ऐप बंद हो।'
          )}
        </p>
        <button
          type="button"
          onClick={handleEnable}
          disabled={loading}
          className="px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-bold disabled:opacity-60"
        >
          {loading ? t('Enabling...', 'चालू हो रहा है...') : t('Enable Reminders', 'याद दिलाना चालू करें')}
        </button>
      </div>
      <button type="button" onClick={handleDismiss} className="p-1 rounded-full hover:bg-muted flex-shrink-0" aria-label={t('Dismiss', 'बंद करें')}>
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
};

export default PushOptInBanner;
