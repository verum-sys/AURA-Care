import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Heart, Users, Copy, CheckCircle2, ArrowRight, Loader2, RefreshCw, User } from 'lucide-react';
import { useClerk } from '@clerk/react';
import { useApp } from '@/context/AppContext';
import LanguageToggle from '@/components/LanguageToggle';
import { toast } from '@/hooks/use-toast';
import * as db from '@/lib/database';

const Index = () => {
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { t, role, setRole, pairingCode, generatePairingCode, linkWithCode, linkedCaregiver, linkedSenior, currentUserId, loading, refreshData, linkAsSecondaryCaregiver, goBackToRoleSelection, needsOnboarding } = useApp();
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Caregiver-only: switch between "generate a pairing code for a new senior"
  // and "I was invited by another caregiver" (join an existing senior as secondary).
  const [inviteMode, setInviteMode] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [inviteCodeError, setInviteCodeError] = useState('');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  // A caregiver-invite WhatsApp link (?invite=CODE) — see the "Invite Other
  // Caregivers" step of the onboarding wizard. Someone opening this link is
  // always joining as a (secondary) caregiver, so it short-circuits the role
  // picker exactly like a role chosen on the login screen does below.
  const [inviteFromUrl] = useState(() => new URLSearchParams(window.location.search).get('invite'));

  // Captured once on mount: was a role already chosen on the login screen?
  // If so, we must never flash the "Who are you?" picker while waiting for
  // that role to finish applying (setRole is async).
  const [hasPendingRole] = useState(() => {
    const pending = localStorage.getItem('pending_role');
    return pending === 'senior' || pending === 'caregiver' || !!inviteFromUrl;
  });

  // Auto-redirect if already paired
  useEffect(() => {
    if (loading || !currentUserId) return;
    if (role === 'senior' && linkedCaregiver) {
      navigate('/senior/checkin', { replace: true });
    } else if (role === 'caregiver' && linkedSenior) {
      navigate(needsOnboarding ? '/caregiver/onboarding' : '/caregiver', { replace: true });
    }
  }, [role, linkedCaregiver, linkedSenior, needsOnboarding, loading, currentUserId, navigate]);

  // While a caregiver is sitting on the "waiting for dependant" screen,
  // nothing else tells this tab that the senior has claimed the code —
  // poll for it so the caregiver moves on to their dashboard automatically
  // instead of needing to manually refresh the page.
  useEffect(() => {
    if (role !== 'caregiver' || linkedSenior || !currentUserId) return;
    const interval = setInterval(() => {
      refreshData();
    }, 3000);
    return () => clearInterval(interval);
  }, [role, linkedSenior, currentUserId, refreshData]);

  // Auto-generate pairing code for caregiver if they don't have one
  useEffect(() => {
    if (role === 'caregiver' && !pairingCode && currentUserId) {
      generatePairingCode();
    }
  }, [role, pairingCode, currentUserId, generatePairingCode]);

  // Check if user already has an opposite role in the DB and block them —
  // otherwise the same Clerk account could end up as both a senior and a
  // caregiver, which the rest of the app doesn't handle.
  const validateRoleConflict = async (requestedRole: 'senior' | 'caregiver'): Promise<boolean> => {
    if (!currentUserId) return true;
    try {
      const dbUser = await db.getUser(currentUserId);
      if (dbUser?.role && dbUser.role !== requestedRole) {
        const existingLabel = dbUser.role === 'senior' ? t('Dependant', 'आश्रित') : t('Caregiver', 'देखभालकर्ता');
        const requestedLabel = requestedRole === 'senior' ? t('Dependant', 'आश्रित') : t('Caregiver', 'देखभालकर्ता');
        toast({
          title: t('Account already registered', 'खाता पहले से पंजीकृत'),
          description: t(
            `This email is already registered as a ${existingLabel}. You cannot use the same email as a ${requestedLabel}. Please sign in with a different email.`,
            `यह ईमेल पहले से ${existingLabel} के रूप में पंजीकृत है। आप एक ही ईमेल को ${requestedLabel} के रूप में उपयोग नहीं कर सकते। कृपया किसी अन्य ईमेल से साइन इन करें।`
          ),
          variant: 'destructive',
        });
        // Sign the user out so they can use a different account
        await signOut();
        return false;
      }
    } catch (err) {
      console.error('Role conflict check error:', err);
    }
    return true;
  };

  const handleSelectCaregiver = async () => {
    const allowed = await validateRoleConflict('caregiver');
    if (!allowed) return;
    await setRole('caregiver');
    generatePairingCode();
  };

  const handleSelectSenior = async () => {
    const allowed = await validateRoleConflict('senior');
    if (!allowed) return;
    setRole('senior');
  };

  // Auto-select role from login screen choice
  useEffect(() => {
    if (!currentUserId || loading || role) return;
    if (inviteFromUrl) {
      handleSelectCaregiver();
      return;
    }
    const pendingRole = localStorage.getItem('pending_role');
    if (pendingRole === 'senior' || pendingRole === 'caregiver') {
      localStorage.removeItem('pending_role');
      if (pendingRole === 'caregiver') {
        handleSelectCaregiver();
      } else {
        handleSelectSenior();
      }
    }
  }, [currentUserId, loading, role, inviteFromUrl]);

  // Once a caregiver-invite link has picked the caregiver role, also jump
  // straight to the "I was invited" tab with the code pre-filled — otherwise
  // they'd still have to notice the toggle and retype a code already in hand.
  useEffect(() => {
    if (inviteFromUrl && role === 'caregiver' && !linkedSenior) {
      setInviteMode(true);
      setInviteCodeInput(inviteFromUrl.replace(/\D/g, '').slice(0, 6));
    }
  }, [inviteFromUrl, role, linkedSenior]);

  // Wait for Clerk + Supabase to load — also wait here while a role chosen
  // on the login screen is still being applied, so the "Who are you?"
  // picker never flashes for users who already picked a role.
  if (!currentUserId || loading || (hasPendingRole && !role)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const handleSubmitInviteCode = async () => {
    setInviteCodeError('');
    if (inviteCodeInput.length !== 6) {
      setInviteCodeError(t('Please enter a 6-digit code', 'कृपया 6 अंकों का कोड दर्ज करें'));
      return;
    }
    setInviteSubmitting(true);
    try {
      const result = await linkAsSecondaryCaregiver(inviteCodeInput);
      if (result.success) {
        toast({ title: t('Connected as a caregiver!', 'देखभालकर्ता के रूप में जुड़ गए!') });
        navigate('/caregiver');
      } else {
        setInviteCodeError(result.error || t('Invalid or expired code.', 'अमान्य या समाप्त कोड।'));
      }
    } finally {
      setInviteSubmitting(false);
    }
  };

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
        navigate('/senior/checkin');
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

        {/* Mode toggle: new senior vs. invited by another caregiver */}
        <div className="flex gap-2 mb-6 p-1 rounded-xl bg-muted/50 animate-slide-up-delay-1">
          <button
            type="button"
            onClick={() => setInviteMode(false)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${!inviteMode ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            {t("I'm new", 'मैं नया हूँ')}
          </button>
          <button
            type="button"
            onClick={() => setInviteMode(true)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${inviteMode ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'}`}
          >
            {t('I was invited', 'मुझे आमंत्रित किया गया')}
          </button>
        </div>

        {!inviteMode ? (
          <>
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
          </>
        ) : (
          <div className="bg-card rounded-2xl p-5 border-2 border-primary/20 shadow-card space-y-4 animate-slide-up-delay-2">
            <p className="text-sm text-muted-foreground font-semibold">
              {t('Enter the code the primary caregiver shared with you to join as a caregiver.', 'मुख्य देखभालकर्ता द्वारा साझा किया गया कोड दर्ज करें।')}
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={inviteCodeInput}
              onChange={(e) => {
                setInviteCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                setInviteCodeError('');
              }}
              placeholder="------"
              className="w-full text-center text-3xl font-black tracking-[0.3em] py-4 px-4 rounded-xl border-2 border-primary/20 bg-background text-foreground focus:border-primary focus:outline-none font-mono"
            />
            {inviteCodeError && (
              <p className="text-destructive text-sm font-semibold text-center">{inviteCodeError}</p>
            )}
            <button
              type="button"
              onClick={handleSubmitInviteCode}
              disabled={inviteCodeInput.length !== 6 || inviteSubmitting}
              className="w-full elder-tile gradient-primary text-primary-foreground text-elder-lg py-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviteSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {t('Connect', 'जोड़ें')}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </button>
          </div>
        )}

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
