import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, UtensilsCrossed, SmilePlus, Clock, Wifi, Battery, AlertTriangle, Copy, CheckCircle2, RefreshCw, Link, User, Scan } from 'lucide-react';
import CaregiverLayout from '@/components/CaregiverLayout';
import { useApp } from '@/context/AppContext';
import { caregiverOverview } from '@/data/dummyData';

const d = caregiverOverview;

const moodEmoji = { good: '😊', okay: '🙂', not_well: '😟' } as const;
const moodLabels = { good: ['Good', 'अच्छा'], okay: ['Okay', 'ठीक'], not_well: ['Not Well', 'अच्छा नहीं'] } as const;

const Overview = () => {
  const navigate = useNavigate();
  const { t, wellbeing, sharedMedicines, dynamicAlerts, pairingCode, generatePairingCode, activeSeniorId, activeSeniorName, linkedSenior } = useApp();
  const [copied, setCopied] = useState(false);

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
      {/* Pairing Code Card — only shown when no loved one connected */}
      {!linkedSenior && (
        <div className="bg-card rounded-elder p-4 shadow-card border-2 border-primary/20 mb-4 animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <Link className="w-5 h-5 text-primary" />
            <span className="text-sm font-bold text-foreground">{t('Connect a Loved One', 'अपनों को जोड़ें')}</span>
          </div>

          <div className="bg-muted/50 rounded-elder p-5 text-center border border-dashed border-muted-foreground/20 mb-3">
            <User className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold text-muted-foreground">
              {t('No loved one connected yet', 'अभी कोई अपना नहीं जुड़ा')}
            </p>
          </div>

          {/* Large code display */}
          <div
            onClick={handleCopyCode}
            className="bg-muted/50 rounded-xl px-4 py-3 cursor-pointer hover:bg-muted transition-colors flex items-center justify-between"
          >
            <span className="text-3xl font-black text-primary tracking-[0.25em] font-mono">
              {pairingCode || '------'}
            </span>
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
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            {t('Share this code with your loved one. They will enter it in their app to connect.', 'यह कोड अपनों को दें। वे इसे अपने ऐप में दर्ज करेंगे।')}
          </p>

          <button
            type="button"
            onClick={() => { generatePairingCode(true); }}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 transition-all text-primary font-bold text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {t('Generate New Code', 'नया कोड बनाएं')}
          </button>
        </div>
      )}

      {/* Loved One Dashboard — only shown when connected */}
      {showDashboard && (
        <>
          {/* Status Banner */}
          <div className="gradient-hero rounded-elder p-5 text-primary-foreground mb-4 shadow-glow-primary animate-slide-up-delay-2">
            <p className="text-sm font-semibold opacity-80">{t('Care Dashboard', 'देखभाल डैशबोर्ड')}</p>
            <h2 className="text-2xl font-black mt-1">{activeSeniorName}</h2>
            <div className="flex items-center gap-2 mt-2 opacity-80">
              <Clock className="w-4 h-4" />
              <span className="text-sm font-semibold">{t(`Last active: ${d.lastActive}`, `अंतिम सक्रिय: ${d.lastActiveHi}`)}</span>
            </div>
          </div>

          {/* Scan Prescription Button */}
          <button
            type="button"
            onClick={() => navigate('/caregiver/scan')}
            className="w-full flex items-center justify-center gap-3 px-4 py-4 mb-6 rounded-elder gradient-primary text-primary-foreground font-bold text-lg shadow-glow-primary active:scale-[0.98] transition-all animate-slide-up-delay-2"
          >
            <Scan className="w-6 h-6" />
            {t('Scan Prescription', 'प्रिस्क्रिप्शन स्कैन करें')}
          </button>

          <div className="grid grid-cols-2 gap-3">
            {/* Medication Adherence */}
            <div className="bg-card rounded-elder p-4 shadow-card animate-slide-up-delay-2">
              <div className="flex items-center gap-2 mb-2">
                <Pill className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold text-muted-foreground">{t('Medicines', 'दवाइयाँ')}</span>
              </div>
              <p className="text-3xl font-black text-foreground">{adherence}%</p>
              <p className="text-xs text-muted-foreground font-semibold">
                {totalMeds > 0
                  ? `${takenCount}/${totalMeds} ${t('taken', 'ली गई')}`
                  : t('No medicines yet', 'अभी कोई दवाई नहीं')
                }
              </p>
            </div>

            {/* Mood */}
            <div className={`bg-card rounded-elder p-4 shadow-card animate-slide-up-delay-3 ${wellbeing?.mood === 'not_well' ? 'border-2 border-destructive/30' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <SmilePlus className="w-5 h-5 text-secondary" />
                <span className="text-sm font-bold text-muted-foreground">{t('Mood', 'मूड')}</span>
              </div>
              <p className="text-3xl font-black text-foreground">{currentMoodEmoji}</p>
              <p className={`text-xs font-semibold ${wellbeing?.mood === 'not_well' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {t(currentMoodLabel[0], currentMoodLabel[1])}
                {wellbeing?.painArea && ` – ${wellbeing.painArea}`}
              </p>
            </div>

            {/* Meals */}
            <div className="bg-card rounded-elder p-4 shadow-card animate-slide-up-delay-4">
              <div className="flex items-center gap-2 mb-2">
                <UtensilsCrossed className="w-5 h-5 text-warning" />
                <span className="text-sm font-bold text-muted-foreground">{t('Meals', 'भोजन')}</span>
              </div>
              <div className="flex gap-2 mt-1">
                {[
                  { label: 'B', done: d.mealsToday.breakfast },
                  { label: 'L', done: d.mealsToday.lunch },
                  { label: 'D', done: d.mealsToday.dinner },
                ].map(m => (
                  <span key={m.label} className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${m.done ? 'bg-success text-success-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {m.label}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground font-semibold mt-2">{t('1 of 3 confirmed', '3 में से 1 पुष्टि')}</p>
            </div>

            {/* Connectivity */}
            <div className="bg-card rounded-elder p-4 shadow-card animate-slide-up-delay-5">
              <div className="flex items-center gap-2 mb-2">
                <Wifi className="w-5 h-5 text-success" />
                <span className="text-sm font-bold text-muted-foreground">{t('Status', 'स्थिति')}</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wifi className="w-3 h-3 text-success" />
                  <span className="text-xs font-bold text-foreground">{t(d.internetStatus, d.internetStatusHi)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Battery className="w-3 h-3 text-warning" />
                  <span className="text-xs font-bold text-foreground">{d.batteryLevel}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Active Alerts */}
          <div className={`mt-6 rounded-elder p-4 border animate-slide-up-delay-5 ${criticalCount > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-destructive/5 border-destructive/20'}`}>
            <div className="flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${criticalCount > 0 ? 'text-destructive animate-pulse' : 'text-destructive'}`} />
              <span className="font-bold text-foreground">{t('Active Alerts', 'सक्रिय अलर्ट')}: {alertCount}</span>
            </div>
            <p className="text-sm text-muted-foreground font-semibold mt-1">
              {criticalCount > 0
                ? t(`${criticalCount} critical alert requires attention`, `${criticalCount} गंभीर अलर्ट पर ध्यान दें`)
                : t('No critical alerts', 'कोई गंभीर अलर्ट नहीं')
              }
            </p>
          </div>
        </>
      )}
    </CaregiverLayout>
  );
};

export default Overview;
