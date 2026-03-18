import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Heart, Users, Copy, CheckCircle2, ArrowRight, Loader2, RefreshCw, User } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import LanguageToggle from '@/components/LanguageToggle';
import { toast } from '@/hooks/use-toast';

const Index = () => {
  const navigate = useNavigate();
  const { t, role, setRole, pairingCode, generatePairingCode, linkWithCode, linkedCaregiver, linkedSenior, currentUserId, loading } = useApp();
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Auto-redirect if already paired
  useEffect(() => {
    if (loading || !currentUserId) return;
    if (role === 'senior' && linkedCaregiver) {
      navigate('/senior', { replace: true });
    } else if (role === 'caregiver' && linkedSenior) {
      navigate('/caregiver', { replace: true });
    }
  }, [role, linkedCaregiver, linkedSenior, loading, currentUserId, navigate]);

  // Auto-generate pairing code for caregiver if they don't have one
  useEffect(() => {
    if (role === 'caregiver' && !pairingCode && currentUserId) {
      generatePairingCode();
    }
  }, [role, pairingCode, currentUserId, generatePairingCode]);

  const handleSelectCaregiver = async () => {
    await setRole('caregiver');
    generatePairingCode();
  };

  const handleSelectSenior = () => {
    setRole('senior');
  };

  // Auto-select role from login screen choice
  useEffect(() => {
    if (!currentUserId || loading || role) return;
    const pendingRole = localStorage.getItem('pending_role');
    if (pendingRole === 'senior' || pendingRole === 'caregiver') {
      localStorage.removeItem('pending_role');
      if (pendingRole === 'caregiver') {
        handleSelectCaregiver();
      } else {
        handleSelectSenior();
      }
    }
  }, [currentUserId, loading, role]);

  // Wait for Clerk + Supabase to load
  if (!currentUserId || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const handleCopyCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      toast({ title: t('Code copied!', 'कोड कॉपी हो गया!') });
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
        navigate('/senior');
      } else if (result.error === 'You are already connected to a caregiver') {
        setCodeError(t('You are already connected to a caregiver.', 'आप पहले से एक देखभालकर्ता से जुड़े हैं।'));
      } else if (result.error === 'This caregiver is already connected to another loved one') {
        setCodeError(t('This caregiver is already connected to another loved one.', 'यह देखभालकर्ता पहले से किसी और अपने से जुड़ा है।'));
      } else {
        setCodeError(t('Invalid code. Please check with your caregiver.', 'अमान्य कोड। कृपया अपने देखभालकर्ता से जाँच करें।'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1: Role selection
  if (!role) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-md mx-auto">
        <div className="absolute top-5 right-5">
          <LanguageToggle />
        </div>

        <div className="animate-slide-up mb-2">
          <div className="w-20 h-20 rounded-2xl gradient-hero flex items-center justify-center shadow-glow-primary mx-auto">
            <Shield className="w-10 h-10 text-primary-foreground" />
          </div>
        </div>

        <h1 className="text-elder-2xl font-black text-foreground text-center mt-5 animate-slide-up-delay-1">
          {t('Welcome!', 'स्वागत है!')}
        </h1>
        <p className="text-muted-foreground text-center font-semibold mt-2 animate-slide-up-delay-2">
          {t('Who are you?', 'आप कौन हैं?')}
        </p>

        <div className="w-full mt-10 space-y-4">
          <button
            type="button"
            onClick={handleSelectSenior}
            className="w-full elder-tile gradient-primary text-primary-foreground flex-col gap-3 text-elder-xl animate-slide-up-delay-3"
          >
            <Heart className="w-10 h-10" />
            <span>{t('I am a Senior', 'मैं बुज़ुर्ग हूँ')}</span>
            <span className="text-sm font-semibold opacity-80">{t('Simple & Easy Interface', 'सरल और आसान')}</span>
          </button>

          <button
            type="button"
            onClick={handleSelectCaregiver}
            className="w-full elder-tile bg-card text-foreground flex-col gap-3 text-elder-xl border-2 border-primary/20 animate-slide-up-delay-4"
          >
            <Users className="w-10 h-10 text-primary" />
            <span>{t('I am a Caregiver', 'मैं देखभालकर्ता हूँ')}</span>
            <span className="text-sm font-semibold text-muted-foreground">{t('Dashboard & Controls', 'डैशबोर्ड और नियंत्रण')}</span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground mt-8 text-center animate-slide-up-delay-5">
          {t('Made with ❤️ for India\'s elderly', 'भारत के बुज़ुर्गों के लिए ❤️ से बनाया गया')}
        </p>
      </div>
    );
  }

  // Step 2a: Caregiver — show pairing code (if already paired, useEffect redirects)
  if (role === 'caregiver') {
    if (linkedSenior) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      );
    }

    // Not paired yet — show pairing code
    return (
      <div className="min-h-screen bg-background flex flex-col px-6 max-w-md mx-auto py-8">
        <div className="absolute top-5 right-5">
          <LanguageToggle />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6 animate-slide-up">
          <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center shadow-glow-primary">
            <Shield className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-elder-xl font-black text-foreground">
              {t('Kin Care', 'किन केयर')}
            </h1>
            <p className="text-sm text-muted-foreground font-semibold">
              {t('Caregiver Home', 'देखभालकर्ता होम')}
            </p>
          </div>
        </div>

        {/* No loved one connected */}
        <div className="mb-6 animate-slide-up-delay-1">
          <div className="bg-muted/50 rounded-2xl p-6 text-center border border-dashed border-muted-foreground/20">
            <User className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold text-muted-foreground">
              {t('No loved one connected yet', 'अभी कोई अपना नहीं जुड़ा')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('Share the code below with your loved one to connect.', 'नीचे दिया गया कोड अपनों को दें।')}
            </p>
          </div>
        </div>

        {/* Pairing code */}
        <div className="bg-card rounded-2xl p-5 border-2 border-primary/20 shadow-card space-y-4 animate-slide-up-delay-2">
          <p className="text-sm text-muted-foreground font-semibold">
            {t('Share this code with your loved one. They will enter it in their app to connect.', 'यह कोड अपनों को दें। वे इसे अपने ऐप में दर्ज करेंगे।')}
          </p>

          <div
            onClick={handleCopyCode}
            className="bg-muted/50 rounded-xl px-4 py-4 cursor-pointer hover:bg-muted transition-colors flex items-center justify-between"
          >
            <span className="text-3xl font-black text-primary tracking-[0.25em] font-mono">
              {pairingCode || (
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              )}
            </span>
            {pairingCode && (
              <div className="flex items-center gap-1 text-sm">
                {copied ? (
                  <span className="flex items-center gap-1 text-success font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    {t('Copied', 'कॉपी')}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground font-semibold">
                    <Copy className="w-4 h-4" />
                    {t('Copy', 'कॉपी')}
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => generatePairingCode(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 transition-all text-primary font-bold text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {t('Generate New Code', 'नया कोड बनाएं')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setRole(null)}
          className="w-full text-center text-sm text-muted-foreground font-semibold py-2 mt-6"
        >
          {t('← Go Back', '← वापस जाएं')}
        </button>
      </div>
    );
  }

  // Step 2b: Senior — code entry (if already paired, useEffect redirects)
  if (role === 'senior') {
    if (linkedCaregiver) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      );
    }

    // Not paired yet — code entry
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 max-w-md mx-auto">
        <div className="absolute top-5 right-5">
          <LanguageToggle />
        </div>

        <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center shadow-glow-primary mb-4 animate-slide-up">
          <Heart className="w-8 h-8 text-primary-foreground" />
        </div>

        <h2 className="text-elder-xl font-black text-foreground text-center animate-slide-up-delay-1">
          {t('Enter Caregiver Code', 'देखभालकर्ता कोड दर्ज करें')}
        </h2>
        <p className="text-muted-foreground text-center font-semibold mt-2 max-w-xs animate-slide-up-delay-2">
          {t(
            'Ask your caregiver or doctor for the 6-digit code.',
            'अपने देखभालकर्ता या डॉक्टर से 6 अंकों का कोड पूछें।'
          )}
        </p>

        <div className="w-full space-y-4 animate-slide-up-delay-3">
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
            className="w-full text-center text-4xl font-black tracking-[0.4em] py-5 px-4 rounded-2xl border-2 border-primary/20 bg-card text-foreground focus:border-primary focus:outline-none font-mono"
          />

          {codeError && (
            <p className="text-destructive text-sm font-semibold text-center">{codeError}</p>
          )}

          <button
            type="button"
            onClick={handleSubmitCode}
            disabled={codeInput.length !== 6 || submitting}
            className="w-full elder-tile gradient-primary text-primary-foreground text-elder-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {t('Connect', 'जोड़ें')}
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setRole(null)}
            className="w-full text-center text-sm text-muted-foreground font-semibold py-2"
          >
            {t('← Go Back', '← वापस जाएं')}
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default Index;
