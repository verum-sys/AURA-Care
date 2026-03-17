import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, CloudSun, Shield, Users, User, ArrowRight, Loader2, Pill, UtensilsCrossed, SmilePlus, Heart } from 'lucide-react';
import SeniorLayout from '@/components/SeniorLayout';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';

const Welcome = () => {
  const navigate = useNavigate();
  const { t, linkedCaregiver, linkWithCode, sharedMedicines, wellbeing, currentUserName } = useApp();
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitCode = async () => {
    setCodeError('');
    if (codeInput.length !== 6) {
      setCodeError(t('Please enter a 6-digit code', 'कृपया 6 अंकों का कोड दर्ज करें'));
      return;
    }
    setSubmitting(true);
    try {
      const result = await linkWithCode(codeInput);
      if (result.success) {
        toast({ title: t('Connected to caregiver!', 'देखभालकर्ता से जुड़ गए!') });
        setCodeInput('');
        setShowCodeInput(false);
      } else {
        setCodeError(t('Invalid code. Please check with your caregiver.', 'अमान्य कोड। कृपया अपने देखभालकर्ता से जाँच करें।'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const hour = new Date().getHours();
  const GreetIcon = hour < 12 ? Sun : hour < 17 ? CloudSun : Moon;
  const greetLabel = hour < 12
    ? t('Good Morning', 'सुप्रभात')
    : hour < 17
    ? t('Good Afternoon', 'नमस्कार')
    : t('Good Evening', 'शुभ संध्या');

  // Quick status
  const pendingMeds = sharedMedicines.filter(m => !m.taken).length;
  const totalMeds = sharedMedicines.length;
  const wellbeingDoneToday = wellbeing?.timestamp
    ? new Date(wellbeing.timestamp).toDateString() === new Date().toDateString()
    : false;

  const firstName = currentUserName.split(' ')[0];

  return (
    <SeniorLayout>
      {/* Hero greeting — full-bleed gradient card */}
      <div className="relative -mx-5 -mt-6 px-6 pt-10 pb-8 gradient-hero text-primary-foreground overflow-hidden animate-slide-up">
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center">
              <GreetIcon className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-semibold opacity-80">{greetLabel}</p>
              <h2 className="text-elder-2xl font-black leading-tight">{firstName}</h2>
            </div>
          </div>

          {/* Quick status pills */}
          {totalMeds > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                pendingMeds === 0 ? 'bg-white/20 text-white' : 'bg-white/90 text-amber-700'
              }`}>
                <Pill className="w-3.5 h-3.5" />
                {pendingMeds === 0
                  ? t('All medicines taken', 'सभी दवाइयाँ ली गईं')
                  : t(`${pendingMeds} medicine${pendingMeds > 1 ? 's' : ''} pending`, `${pendingMeds} दवाई बाकी`)
                }
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                wellbeingDoneToday ? 'bg-white/20 text-white' : 'bg-white/90 text-teal-700'
              }`}>
                <SmilePlus className="w-3.5 h-3.5" />
                {wellbeingDoneToday
                  ? t('Mood checked in', 'मूड दर्ज')
                  : t('Mood not checked', 'मूड दर्ज नहीं')
                }
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Action tiles */}
      <div className="space-y-3 mt-6">
        <button
          onClick={() => navigate('/senior/home')}
          className="action-tile w-full bg-card text-foreground animate-slide-up-delay-1"
        >
          <div className="stat-icon-bg gradient-warm">
            <Sun className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-elder-lg font-black">{t('Start My Day', 'मेरा दिन शुरू करें')}</p>
            <p className="text-xs text-muted-foreground font-semibold">{t('Medicines, meals & more', 'दवाइयाँ, भोजन और अन्य')}</p>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </button>

        <button
          onClick={() => navigate('/senior/medicines')}
          className="action-tile w-full bg-card text-foreground animate-slide-up-delay-2"
        >
          <div className="stat-icon-bg bg-primary/10">
            <Pill className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-foreground">{t('My Medicines', 'मेरी दवाइयाँ')}</p>
            <p className="text-xs text-muted-foreground font-semibold">
              {totalMeds > 0
                ? `${totalMeds - pendingMeds}/${totalMeds} ${t('taken today', 'आज ली गई')}`
                : t('No medicines yet', 'अभी कोई दवाई नहीं')
              }
            </p>
          </div>
          {pendingMeds > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-warning/10 text-warning text-xs font-black">{pendingMeds}</span>
          )}
        </button>

        <button
          onClick={() => navigate('/senior/wellbeing')}
          className="action-tile w-full bg-card text-foreground animate-slide-up-delay-3"
        >
          <div className="stat-icon-bg bg-secondary/10">
            <SmilePlus className="w-5 h-5 text-secondary" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-foreground">{t('How Are You Feeling?', 'आप कैसा महसूस कर रहे हैं?')}</p>
            <p className="text-xs text-muted-foreground font-semibold">
              {wellbeingDoneToday
                ? t('Checked in today', 'आज दर्ज किया')
                : t('Tap to check in', 'दर्ज करने के लिए टैप करें')
              }
            </p>
          </div>
          {!wellbeingDoneToday && (
            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse" />
          )}
        </button>

        <button
          onClick={() => navigate('/senior/meals')}
          className="action-tile w-full bg-card text-foreground animate-slide-up-delay-4"
        >
          <div className="stat-icon-bg bg-warning/10">
            <UtensilsCrossed className="w-5 h-5 text-warning" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-foreground">{t('Did You Eat?', 'क्या आपने खाना खाया?')}</p>
            <p className="text-xs text-muted-foreground font-semibold">{t('Log your meals', 'अपना भोजन दर्ज करें')}</p>
          </div>
        </button>
      </div>

      {/* Caregiver card */}
      <div className="mt-6 animate-slide-up-delay-5">
        {linkedCaregiver ? (
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full gradient-primary flex items-center justify-center text-lg font-bold text-primary-foreground shadow-glow-primary">
                {linkedCaregiver.caregiverName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground font-semibold">{t('My Caregiver', 'मेरे देखभालकर्ता')}</p>
                <p className="font-bold text-foreground">{linkedCaregiver.caregiverName}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-xs font-bold text-success">{t('Online', 'ऑनलाइन')}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-5 text-center">
            <Heart className="w-8 h-8 text-primary mx-auto mb-2 opacity-40" />
            <p className="text-sm font-bold text-foreground mb-1">
              {t('Connect with your caregiver', 'अपने देखभालकर्ता से जुड़ें')}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {t('Ask them for a 6-digit code', 'उनसे 6 अंकों का कोड पूछें')}
            </p>

            {!showCodeInput ? (
              <button
                type="button"
                onClick={() => setShowCodeInput(true)}
                className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm"
              >
                {t('Enter Code', 'कोड दर्ज करें')}
              </button>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setCodeError('');
                  }}
                  placeholder="------"
                  className="w-full text-center text-3xl font-black tracking-[0.3em] py-4 px-4 rounded-xl border-2 border-primary/20 bg-background text-foreground focus:border-primary focus:outline-none font-mono"
                />
                {codeError && (
                  <p className="text-destructive text-xs font-semibold">{codeError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowCodeInput(false); setCodeInput(''); setCodeError(''); }}
                    className="flex-1 py-3 rounded-xl border border-border text-muted-foreground font-bold text-sm"
                  >
                    {t('Cancel', 'रद्द करें')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitCode}
                    disabled={codeInput.length !== 6 || submitting}
                    className="flex-1 py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <>{t('Connect', 'जोड़ें')} <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 mt-6 mb-2 text-muted-foreground">
        <Shield className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold">{t('Protected by Kin Care', 'किन केयर द्वारा सुरक्षित')}</span>
      </div>
    </SeniorLayout>
  );
};

export default Welcome;
