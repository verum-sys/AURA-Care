import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, SmilePlus, UtensilsCrossed, TrendingUp, Link, Copy, CheckCircle2, RefreshCw, Phone, Activity, ChevronRight, type LucideIcon } from 'lucide-react';
import CaregiverLayout from '@/components/CaregiverLayout';
import OnboardingResumeBanner from '@/components/caregiver/OnboardingResumeBanner';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';
import * as db from '@/lib/database';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
type MealType = typeof MEAL_TYPES[number];

const mealLabel: Record<MealType, [string, string]> = {
  breakfast: ['Breakfast', 'नाश्ता'],
  lunch: ['Lunch', 'दोपहर का खाना'],
  dinner: ['Dinner', 'रात का खाना'],
};

/** Today's pending-medicine count, phrased as a skip message rather than a percentage. */
function medicineSkipMessage(skipped: number, t: (en: string, hi: string) => string): string {
  if (skipped === 0) return t('No medicine skipped', 'कोई दवाई नहीं छूटी');
  if (skipped === 1) return t('One medicine skipped recorded', 'एक दवाई छूटने का रिकॉर्ड');
  if (skipped === 2) return t('Medicine skip recorded twice', 'दो बार दवाई छूटने का रिकॉर्ड');
  if (skipped === 3) return t('Medicine skip recorded thrice', 'तीन बार दवाई छूटने का रिकॉर्ड');
  return t(`Medicine skip recorded ${skipped} times`, `${skipped} बार दवाई छूटने का रिकॉर्ड`);
}

/** "morning" / "afternoon" / "evening", from a wellbeing check-in's timestamp. */
function timeOfDay(timestamp: string, t: (en: string, hi: string) => string): string {
  const hour = new Date(timestamp).getHours();
  if (hour < 12) return t('this morning', 'आज सुबह');
  if (hour < 17) return t('this afternoon', 'आज दोपहर');
  return t('this evening', 'आज शाम');
}

/** "5 minutes ago" / "2 hours ago" / "3 days ago", from a last-activity timestamp. */
function relativeTimeAgo(timestamp: string, t: (en: string, hi: string) => string): string {
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (diffMin < 1) return t('just now', 'अभी-अभी');
  if (diffMin < 60) return t(`${diffMin} minute${diffMin === 1 ? '' : 's'} ago`, `${diffMin} मिनट पहले`);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t(`${diffHr} hour${diffHr === 1 ? '' : 's'} ago`, `${diffHr} घंटे पहले`);
  const diffDay = Math.floor(diffHr / 24);
  return t(`${diffDay} day${diffDay === 1 ? '' : 's'} ago`, `${diffDay} दिन पहले`);
}

type Tone = 'primary' | 'good' | 'warn' | 'sad' | 'none';

// Full, literal Tailwind class strings per tone — NOT built via string
// interpolation (e.g. `bg-${x}`), since Tailwind's compiler only generates
// CSS for class names it can find as complete literal tokens in the source.
// Deliberately restrained: the status colour lives only in the icon tile.
const TONE: Record<Tone, { tile: string; icon: string }> = {
  primary: { tile: 'bg-primary/10', icon: 'text-primary' },
  good: { tile: 'bg-success/10', icon: 'text-success' },
  warn: { tile: 'bg-warning/10', icon: 'text-warning' },
  sad: { tile: 'bg-destructive/10', icon: 'text-destructive' },
  none: { tile: 'bg-muted', icon: 'text-muted-foreground' },
};

// Plain `bg-card` + `border-border` rather than `.glass-card`: that class
// sets a `border:` shorthand that lands later in the compiled CSS than
// Tailwind's border utilities, so per-card borders never rendered on it.
const StatusCard = ({ tone, icon: Icon, label, message, className = '', onClick, children }: {
  tone: Tone; icon: LucideIcon; label: string; message: string;
  className?: string; onClick?: () => void; children?: ReactNode;
}) => {
  const c = TONE[tone];
  const clickable = !!onClick;
  return (
    <div
      className={`rounded-2xl p-5 bg-card border border-border shadow-card ${
        clickable ? 'cursor-pointer transition-all duration-200 hover:shadow-elevated active:scale-[0.99]' : ''
      } ${className}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); }
      } : undefined}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${c.tile}`}>
          <Icon className={`w-6 h-6 ${c.icon}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold mb-1">{label}</p>
          <p className="text-lg font-black leading-snug text-foreground">{message}</p>
        </div>
        {clickable && <ChevronRight className="w-5 h-5 text-muted-foreground/60 flex-shrink-0 -mr-1" />}
      </div>
      {/* Actions nested in a clickable card (e.g. the call-now prompt) must
          not also open the detail page. */}
      {children && <div onClick={(e) => e.stopPropagation()}>{children}</div>}
    </div>
  );
};

const Analytics = () => {
  const navigate = useNavigate();
  const { t, role, currentUserId, sharedMedicines, activeSeniorId, activeSeniorName, linkedSenior, wellbeing, patientDetails, pairingCode, generatePairingCode } = useApp();
  const [copied, setCopied] = useState(false);
  const [sadPromptDismissed, setSadPromptDismissed] = useState(false);
  const [todayMeals, setTodayMeals] = useState<Partial<Record<MealType, boolean>>>({});

  const firstName = activeSeniorName?.split(' ')[0] || activeSeniorName;

  const handleCopyCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCallNow = () => {
    toast({ title: t(`📱 Calling ${firstName}...`, `📱 ${firstName} को कॉल हो रहा है...`) });
  };

  const handleWishToSpeak = () => {
    if (patientDetails?.phone) {
      window.location.href = `tel:${patientDetails.phone}`;
    } else {
      toast({
        title: t('No phone number saved', 'कोई फ़ोन नंबर सहेजा नहीं गया'),
        description: t('Add it in Dependant Profile to enable calling.', 'कॉल करने के लिए इसे आश्रित प्रोफ़ाइल में जोड़ें।'),
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (!activeSeniorId) return;
    let cancelled = false;
    db.getTodayMealLogs(activeSeniorId).then((logs) => {
      if (cancelled) return;
      const map: Partial<Record<MealType, boolean>> = {};
      for (const l of logs) map[l.meal_type as MealType] = l.eaten;
      setTodayMeals(map);
    });
    return () => { cancelled = true; };
  }, [activeSeniorId]);

  // Home doubles as the connect screen, so a caregiver must always have a
  // code to share here — not only on the start screen, which has this same
  // effect. Otherwise a disconnected caregiver sees "------" with no way on.
  useEffect(() => {
    if (role === 'caregiver' && !pairingCode && currentUserId) generatePairingCode();
  }, [role, pairingCode, currentUserId, generatePairingCode]);

  // Reset the "do you want to check now" dismissal whenever a fresh
  // not-well check-in comes in, so it doesn't stay hidden from an old one.
  useEffect(() => { setSadPromptDismissed(false); }, [wellbeing?.timestamp]);

  // Summaries
  const skippedToday = sharedMedicines.filter(m => !m.taken).length;

  const moodTone: 'good' | 'okay' | 'sad' | 'none' =
    wellbeing?.mood === 'good' ? 'good' :
    wellbeing?.mood === 'okay' ? 'okay' :
    wellbeing?.mood === 'not_well' ? 'sad' : 'none';

  const moodMessage =
    moodTone === 'good' ? t(`${firstName} seems to be Happy today`, `${firstName} आज खुश लग रहे हैं`) :
    moodTone === 'okay' ? t(`${firstName} Doing ok`, `${firstName} ठीक-ठाक हैं`) :
    moodTone === 'sad' ? t(`${firstName} seems Sad`, `${firstName} उदास लग रहे हैं`) :
    t('No mood check-in yet today', 'आज अभी तक कोई मूड चेक-इन नहीं');

  const lastActiveMessage = wellbeing
    ? t(`${firstName} was active ${relativeTimeAgo(wellbeing.timestamp, t)}`, `${firstName} ${relativeTimeAgo(wellbeing.timestamp, t)} सक्रिय थे`)
    : t(`No activity recorded yet`, `अभी तक कोई गतिविधि दर्ज नहीं`);

  const missingMeals = MEAL_TYPES.filter(mt => !todayMeals[mt]);
  const mealsMessage = missingMeals.length === 0
    ? t(`${firstName} had all their meals today`, `${firstName} ने आज सभी भोजन कर लिए`)
    : t(
        `${firstName} - Skipped their ${missingMeals.map(mt => mealLabel[mt][0]).join('/')}`,
        `${firstName} - ${missingMeals.map(mt => mealLabel[mt][1]).join('/')} नहीं किया`
      );

  const moodCardTone: Tone = moodTone === 'okay' ? 'warn' : moodTone;

  // ═══ Not connected state — this is now Home, so the connect-a-loved-one
  // flow needs to live here rather than only on Settings. ═══
  if (!linkedSenior) {
    return (
      <CaregiverLayout>
        <div className="animate-slide-up">
          <div className="glass-card rounded-2xl p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Link className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-black text-foreground mb-1">{t('Connect a Loved One', 'अपनों को जोड़ें')}</h3>
            <p className="text-sm text-muted-foreground mb-5">
              {t('Share this code with them to get started', 'शुरू करने के लिए यह कोड उन्हें दें')}
            </p>

            <div
              onClick={handleCopyCode}
              className="bg-muted/60 rounded-2xl px-5 py-4 cursor-pointer hover:bg-muted transition-colors flex items-center justify-between mb-3"
            >
              <span className="text-3xl font-black text-primary tracking-[0.25em] font-mono">
                {pairingCode || '------'}
              </span>
              {copied ? (
                <span className="flex items-center gap-1 text-success font-bold text-sm">
                  <CheckCircle2 className="w-4 h-4" /> {t('Copied', 'कॉपी')}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-muted-foreground font-semibold text-sm">
                  <Copy className="w-4 h-4" /> {t('Copy', 'कॉपी')}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => { generatePairingCode(true); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 transition-all text-primary font-bold text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              {t('Generate New Code', 'नया कोड बनाएं')}
            </button>
          </div>
        </div>
      </CaregiverLayout>
    );
  }

  return (
    <CaregiverLayout>
      <div className="space-y-5">
        <OnboardingResumeBanner />

        <div className="flex items-center gap-3 animate-slide-up">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-lg font-black text-foreground">{t("Today's Overview", 'आज का विवरण')}</h2>
        </div>

        <StatusCard
          tone="primary"
          icon={Activity}
          label={t('Last Active', 'आखिरी सक्रियता')}
          message={lastActiveMessage}
          className="animate-slide-up"
        >
          <button
            type="button"
            onClick={handleWishToSpeak}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm transition-all duration-200 active:scale-[0.98]"
          >
            <Phone className="w-4 h-4" />
            {t('Wish to Speak?', 'बात करना है?')}
          </button>
        </StatusCard>

        <StatusCard
          tone={skippedToday === 0 ? 'good' : 'warn'}
          icon={Pill}
          label={t('Medicine Adherence', 'दवाई पालन')}
          message={medicineSkipMessage(skippedToday, t)}
          className="animate-slide-up-delay-1"
          onClick={() => navigate('/caregiver/detail/medicines')}
        />

        <StatusCard
          tone={moodCardTone}
          icon={SmilePlus}
          label={t('Wellbeing', 'स्वास्थ्य')}
          message={moodMessage}
          className="animate-slide-up-delay-2"
          onClick={() => navigate('/caregiver/detail/wellbeing')}
        >
          {moodTone === 'sad' && !sadPromptDismissed && (
            <div className="mt-4 pt-4 border-t border-destructive/15">
              <p className="text-sm text-muted-foreground font-semibold mb-3">
                {t(
                  `${firstName} seemed sad ${wellbeing ? timeOfDay(wellbeing.timestamp, t) : ''}. Do you want to check now?`,
                  `${firstName} ${wellbeing ? timeOfDay(wellbeing.timestamp, t) : ''} उदास लग रहे थे। क्या आप अभी जाँच करना चाहेंगे?`
                )}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCallNow}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm transition-all duration-200 active:scale-[0.98]"
                >
                  <Phone className="w-4 h-4" />
                  {t('Yes, Call Now', 'हाँ, अभी कॉल करें')}
                </button>
                <button
                  type="button"
                  onClick={() => setSadPromptDismissed(true)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-muted-foreground font-bold text-sm transition-all duration-200 active:scale-[0.98]"
                >
                  {t('Not Now', 'अभी नहीं')}
                </button>
              </div>
            </div>
          )}
        </StatusCard>

        <StatusCard
          tone={missingMeals.length === 0 ? 'good' : 'warn'}
          icon={UtensilsCrossed}
          label={t('Meals', 'भोजन')}
          message={mealsMessage}
          className="animate-slide-up-delay-3"
          onClick={() => navigate('/caregiver/detail/meals')}
        />
      </div>
    </CaregiverLayout>
  );
};

export default Analytics;
