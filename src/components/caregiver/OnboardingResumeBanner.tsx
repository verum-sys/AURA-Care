import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, X } from 'lucide-react';
import { useApp } from '@/context/AppContext';

const DISMISS_KEY = 'kincare_onboarding_banner_dismissed';

// Shown on the caregiver dashboard when they hit "Skip for now" earlier in
// the onboarding wizard — Index.tsx only auto-redirects there once, right
// after pairing, so this is the way back in afterward. Dismissible
// per-browser-session, not "never ask again" (same idiom as PushOptInBanner).
const OnboardingResumeBanner = () => {
  const { t, needsOnboarding } = useApp();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');

  if (!needsOnboarding || dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className="glass-card rounded-2xl p-4 flex items-start gap-3 animate-slide-up border-2 border-primary/20">
      <div className="stat-icon-bg bg-primary/10 flex-shrink-0">
        <UserPlus className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-foreground">{t('Finish setting up your profile', 'अपनी प्रोफ़ाइल सेटअप पूरा करें')}</p>
        <p className="text-xs text-muted-foreground font-semibold mt-0.5 mb-2">
          {t('A couple of quick questions about you and your loved one.', 'आपके और आपके प्रियजन के बारे में कुछ त्वरित सवाल।')}
        </p>
        <button
          type="button"
          onClick={() => navigate('/caregiver/onboarding')}
          className="px-4 py-2 rounded-xl gradient-primary text-primary-foreground text-xs font-bold"
        >
          {t('Continue', 'जारी रखें')}
        </button>
      </div>
      <button type="button" onClick={handleDismiss} className="p-1 rounded-full hover:bg-muted flex-shrink-0" aria-label={t('Dismiss', 'बंद करें')}>
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  );
};

export default OnboardingResumeBanner;
