import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, UtensilsCrossed, SmilePlus, Clock, Wifi, Battery, AlertTriangle, Bell, Copy, CheckCircle2, RefreshCw, Link, User, Scan, Activity, ArrowRight, History } from 'lucide-react';
import CaregiverLayout from '@/components/CaregiverLayout';
import { useApp } from '@/context/AppContext';
import { caregiverOverview } from '@/data/dummyData';

const d = caregiverOverview;

const moodEmoji = { good: '😊', okay: '🙂', not_well: '😟' } as const;
const moodLabels = { good: ['Good', 'अच्छा'], okay: ['Okay', 'ठीक'], not_well: ['Not Well', 'अच्छा नहीं'] } as const;

/** SVG circular progress ring */
const ProgressRing = ({ percent, size = 72, stroke = 6 }: { percent: number; size?: number; stroke?: number }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="progress-ring-bg" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeDasharray={circ} strokeDashoffset={offset} className="progress-ring-fill" />
    </svg>
  );
};

const Overview = () => {
  const navigate = useNavigate();
  const { t, wellbeing, sharedMedicines, dynamicAlerts, pairingCode, generatePairingCode, activeSeniorName, linkedSenior, currentUserId, currentUserName } = useApp();
  const [copied, setCopied] = useState(false);

  // Auto-generate pairing code if caregiver doesn't have one yet
  useEffect(() => {
    if (currentUserId && !pairingCode) {
      generatePairingCode();
    }
  }, [currentUserId, pairingCode, generatePairingCode]);

  const showDashboard = !!linkedSenior;

  const takenCount = sharedMedicines.filter(m => m.taken).length;
  const totalMeds = sharedMedicines.length;
  const adherence = totalMeds > 0 ? Math.round((takenCount / totalMeds) * 100) : 0;
  const alertCount = dynamicAlerts.length;
  const criticalCount = dynamicAlerts.filter(a => a.severity === 'critical').length;

  const currentMoodEmoji = wellbeing?.mood ? moodEmoji[wellbeing.mood] : '—';
  const currentMoodLabel = wellbeing?.mood ? moodLabels[wellbeing.mood] : ['No data', 'कोई डेटा नहीं'];

  const handleCopyCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <CaregiverLayout>
      {/* ═══ Not connected state ═══ */}
      {!linkedSenior && (
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
      )}

      {/* ═══ Pairing code (always visible for caregiver) ═══ */}
      {linkedSenior && pairingCode && (
        <div className="glass-card rounded-2xl p-4 flex items-center justify-between animate-slide-up mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Link className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold">{t('Your Pairing Code', 'आपका पेयरिंग कोड')}</p>
              <p className="text-lg font-black text-primary tracking-[0.15em] font-mono">{pairingCode}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors"
          >
            {copied ? (
              <><CheckCircle2 className="w-4 h-4 text-success" /><span className="text-xs font-bold text-success">{t('Copied', 'कॉपी')}</span></>
            ) : (
              <><Copy className="w-4 h-4 text-primary" /><span className="text-xs font-bold text-primary">{t('Copy', 'कॉपी')}</span></>
            )}
          </button>
        </div>
      )}

      {/* ═══ Connected dashboard ═══ */}
      {showDashboard && (
        <div className="space-y-4">
          {/* Profile + Adherence ring card */}
          <div className="relative gradient-hero rounded-2xl p-5 text-primary-foreground overflow-hidden animate-slide-up">
            <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/5" />
            <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-white/5" />

            <div className="relative z-10 flex items-center gap-4">
              {/* Adherence ring */}
              <div className="relative flex-shrink-0">
                <ProgressRing percent={adherence} size={76} stroke={5} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-black">{adherence}%</span>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold opacity-70">{t('Care Dashboard', 'देखभाल डैशबोर्ड')} · {currentUserName}</p>
                <h2 className="text-xl font-black truncate">{activeSeniorName}</h2>
                <div className="flex items-center gap-1.5 mt-1 opacity-75">
                  <Activity className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">{t(`Active ${d.lastActive}`, `सक्रिय ${d.lastActiveHi}`)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Critical alert banner */}
          {criticalCount > 0 && (
            <button
              type="button"
              onClick={() => navigate('/caregiver/alerts')}
              className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-destructive/10 border border-destructive/25 animate-slide-up-delay-1 active:scale-[0.98] transition-all"
            >
              <div className="w-9 h-9 rounded-xl bg-destructive/15 flex items-center justify-center flex-shrink-0">
                <Bell className="w-4.5 h-4.5 text-destructive animate-pulse" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-black text-destructive">
                  {t(`${criticalCount} Critical Alert`, `${criticalCount} गंभीर अलर्ट`)}
                </p>
                <p className="text-xs text-muted-foreground font-semibold">{t('Tap to view details', 'विवरण देखें')}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-destructive" />
            </button>
          )}

          {/* Scan Prescription */}
          <button
            type="button"
            onClick={() => navigate('/caregiver/scan')}
            className="action-tile w-full bg-card text-foreground border border-primary/15 animate-slide-up-delay-1"
          >
            <div className="stat-icon-bg gradient-primary">
              <Scan className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-foreground">{t('Scan Prescription', 'प्रिस्क्रिप्शन स्कैन करें')}</p>
              <p className="text-xs text-muted-foreground font-semibold">{t('Upload or take a photo', 'अपलोड या फोटो लें')}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-3 animate-slide-up-delay-2">
            {/* Medicines */}
            <div className="glass-card rounded-2xl p-4">
              <div className="stat-icon-bg bg-primary/10 mb-3">
                <Pill className="w-5 h-5 text-primary" />
              </div>
              <p className="text-2xl font-black text-foreground">
                {totalMeds > 0 ? `${takenCount}/${totalMeds}` : '—'}
              </p>
              <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                {t('Medicines Taken', 'दवाइयाँ ली गईं')}
              </p>
              {totalMeds > 0 && (
                <div className="w-full h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                  <div className="h-full rounded-full gradient-primary transition-all duration-500" style={{ width: `${adherence}%` }} />
                </div>
              )}
            </div>

            {/* Mood */}
            <div className={`glass-card rounded-2xl p-4 ${wellbeing?.mood === 'not_well' ? 'ring-2 ring-destructive/30' : ''}`}>
              <div className="stat-icon-bg bg-secondary/10 mb-3">
                <SmilePlus className="w-5 h-5 text-secondary" />
              </div>
              <p className="text-2xl font-black text-foreground">{currentMoodEmoji}</p>
              <p className={`text-xs font-semibold mt-0.5 ${wellbeing?.mood === 'not_well' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {t(currentMoodLabel[0], currentMoodLabel[1])}
                {wellbeing?.painArea && ` — ${wellbeing.painArea}`}
              </p>
            </div>

            {/* Meals */}
            <div className="glass-card rounded-2xl p-4">
              <div className="stat-icon-bg bg-warning/10 mb-3">
                <UtensilsCrossed className="w-5 h-5 text-warning" />
              </div>
              <div className="flex gap-1.5 mb-1">
                {[
                  { label: 'B', done: d.mealsToday.breakfast },
                  { label: 'L', done: d.mealsToday.lunch },
                  { label: 'D', done: d.mealsToday.dinner },
                ].map(m => (
                  <span key={m.label} className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${
                    m.done ? 'bg-success text-white' : 'bg-muted text-muted-foreground'
                  }`}>
                    {m.label}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground font-semibold">{t('Meals Today', 'आज का भोजन')}</p>
            </div>

            {/* Status */}
            <div className="glass-card rounded-2xl p-4">
              <div className="stat-icon-bg bg-success/10 mb-3">
                <Wifi className="w-5 h-5 text-success" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  <span className="text-xs font-bold text-foreground">{t(d.internetStatus, d.internetStatusHi)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Battery className="w-3.5 h-3.5 text-warning" />
                  <span className="text-xs font-bold text-foreground">{d.batteryLevel}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Medicine history */}
          <button
            type="button"
            onClick={() => navigate('/history')}
            className="action-tile w-full bg-card text-foreground border border-border animate-slide-up-delay-3"
          >
            <div className="stat-icon-bg bg-primary/10">
              <History className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-bold text-foreground">{t('Medicine History', 'दवाई इतिहास')}</p>
              <p className="text-xs text-muted-foreground font-semibold">{t('View daily records', 'दैनिक रिकॉर्ड देखें')}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Alerts summary */}
          <button
            type="button"
            onClick={() => navigate('/caregiver/alerts')}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all active:scale-[0.98] animate-slide-up-delay-3 ${
              criticalCount > 0
                ? 'bg-destructive/5 border-destructive/20'
                : alertCount > 0
                ? 'bg-warning/5 border-warning/20'
                : 'bg-success/5 border-success/20'
            }`}
          >
            <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
              criticalCount > 0 ? 'text-destructive' : alertCount > 0 ? 'text-warning' : 'text-success'
            }`} />
            <div className="flex-1 text-left">
              <span className="text-sm font-bold text-foreground">
                {t('Alerts', 'अलर्ट')}: {alertCount}
              </span>
              <p className="text-xs text-muted-foreground font-semibold">
                {criticalCount > 0
                  ? t(`${criticalCount} need attention`, `${criticalCount} पर ध्यान दें`)
                  : t('No critical alerts', 'कोई गंभीर अलर्ट नहीं')
                }
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}
    </CaregiverLayout>
  );
};

export default Overview;
