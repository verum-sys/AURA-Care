import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Shield, Users, User, ArrowRight, Loader2 } from 'lucide-react';
import SeniorLayout from '@/components/SeniorLayout';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';

const Welcome = () => {
  const navigate = useNavigate();
  const { t, linkedCaregiver, linkWithCode } = useApp();
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
      } else if (result.error === 'Already connected to this caregiver') {
        toast({ title: t('Already connected!', 'पहले से जुड़े हुए हैं!') });
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
  const greeting = hour < 12
    ? t('Good Morning! ☀️', 'सुप्रभात! ☀️')
    : hour < 17
    ? t('Good Afternoon! 🌤️', 'नमस्कार! 🌤️')
    : t('Good Evening! 🌙', 'शुभ संध्या! 🌙');

  return (
    <SeniorLayout>
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <div className="w-24 h-24 rounded-full gradient-primary flex items-center justify-center shadow-glow-primary mb-6 animate-slide-up">
          <Sun className="w-12 h-12 text-primary-foreground" />
        </div>

        <h2 className="text-elder-2xl font-black text-foreground animate-slide-up-delay-1">
          {greeting}
        </h2>
        <p className="text-elder-lg text-muted-foreground font-semibold mt-2 animate-slide-up-delay-2">
          {t('How can I help you today?', 'आज मैं आपकी कैसे मदद कर सकता हूँ?')}
        </p>

        <button
          onClick={() => navigate('/senior/home')}
          className="mt-10 w-full elder-tile gradient-warm text-secondary-foreground flex-col gap-2 text-elder-xl py-8 animate-slide-up-delay-3"
        >
          <span className="text-3xl">🌅</span>
          <span>{t('Start My Day', 'मेरा दिन शुरू करें')}</span>
        </button>

        <div className="flex items-center gap-2 mt-6 text-muted-foreground animate-slide-up-delay-4">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{t('You are protected by AURA Care', 'आरा केयर आपकी सुरक्षा कर रहा है')}</span>
        </div>
      </div>

      {/* My Caregiver Section */}
      <div className="mt-8 animate-slide-up-delay-5">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="text-elder-lg font-black text-foreground">
            {t('My Caregiver', 'मेरे देखभालकर्ता')}
          </h3>
        </div>

        {linkedCaregiver ? (
          <div className="flex items-center gap-3 p-4 bg-card rounded-elder border border-border shadow-card">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-lg font-bold text-primary-foreground">
              {linkedCaregiver.caregiverName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="font-bold text-foreground">{linkedCaregiver.caregiverName}</p>
              <p className="text-xs text-muted-foreground">{t('Connected', 'जुड़ा हुआ')}</p>
            </div>
            <span className="px-2 py-1 rounded-full bg-success/10 text-success text-xs font-bold">
              {t('Active', 'सक्रिय')}
            </span>
          </div>
        ) : (
          <>
            <div className="bg-muted/50 rounded-elder p-5 text-center border border-dashed border-muted-foreground/20">
              <User className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-semibold text-muted-foreground">
                {t('No caregiver connected yet', 'अभी कोई देखभालकर्ता नहीं जुड़ा')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('Ask your caregiver for a 6-digit code to connect.', 'अपने देखभालकर्ता से 6 अंकों का कोड पूछें।')}
              </p>
            </div>

            {!showCodeInput ? (
              <button
                type="button"
                onClick={() => setShowCodeInput(true)}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-elder border-2 border-dashed border-primary/30 hover:border-primary/50 bg-primary/5 hover:bg-primary/10 transition-all text-primary font-bold text-sm"
              >
                {t('Enter Caregiver Code', 'देखभालकर्ता कोड दर्ज करें')}
              </button>
            ) : (
              <div className="mt-4 bg-card rounded-elder p-4 border-2 border-primary/20 shadow-card space-y-3">
                <p className="text-sm font-bold text-foreground">
                  {t('Enter 6-digit code from your caregiver', 'अपने देखभालकर्ता से 6 अंकों का कोड दर्ज करें')}
                </p>
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
                  <p className="text-destructive text-sm font-semibold text-center">{codeError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowCodeInput(false); setCodeInput(''); setCodeError(''); }}
                    className="flex-1 px-4 py-3 rounded-xl border border-border text-muted-foreground font-bold text-sm"
                  >
                    {t('Cancel', 'रद्द करें')}
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitCode}
                    disabled={codeInput.length !== 6 || submitting}
                    className="flex-1 px-4 py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        {t('Connect', 'जोड़ें')}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </SeniorLayout>
  );
};

export default Welcome;
