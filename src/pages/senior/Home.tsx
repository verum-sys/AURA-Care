import { useNavigate } from 'react-router-dom';
import { Pill, UtensilsCrossed, SmilePlus, Phone, AlertTriangle, ArrowRight } from 'lucide-react';
import SeniorLayout from '@/components/SeniorLayout';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';

const Home = () => {
  const navigate = useNavigate();
  const { t, sharedMedicines } = useApp();

  const pendingMeds = sharedMedicines.filter(m => !m.taken).length;
  const totalMeds = sharedMedicines.length;

  const handleCall = () => {
    toast({
      title: t('Calling Caregiver...', 'देखभालकर्ता को कॉल कर रहे हैं...'),
      description: t('Connecting you now.', 'अभी जोड़ रहे हैं।'),
    });
  };

  const handleEmergency = () => {
    toast({
      title: t('Emergency Alert Sent!', 'आपातकालीन अलर्ट भेजा गया!'),
      description: t('Help is on the way.', 'मदद आ रही है।'),
      variant: 'destructive',
    });
  };

  return (
    <SeniorLayout title={t('Home', 'होम')} showBack>
      <div className="space-y-3">
        {/* Medicines */}
        <button
          onClick={() => navigate('/senior/medicines')}
          className="action-tile w-full bg-card text-foreground animate-slide-up-delay-1"
        >
          <div className="stat-icon-bg gradient-primary">
            <Pill className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-elder-xl font-black text-foreground">{t('My Medicines', 'मेरी दवाइयाँ')}</p>
            {totalMeds > 0 ? (
              <div className="mt-1.5">
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full gradient-primary transition-all duration-500"
                    style={{ width: `${totalMeds > 0 ? ((totalMeds - pendingMeds) / totalMeds) * 100 : 0}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground font-semibold mt-1">
                  {totalMeds - pendingMeds}/{totalMeds} {t('taken', 'ली गई')}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground font-semibold">{t('No medicines yet', 'अभी कोई दवाई नहीं')}</p>
            )}
          </div>
          {pendingMeds > 0 && (
            <span className="px-3 py-1.5 rounded-full bg-warning/10 text-warning text-sm font-black">{pendingMeds}</span>
          )}
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Meals */}
        <button
          onClick={() => navigate('/senior/meals')}
          className="action-tile w-full bg-card text-foreground animate-slide-up-delay-2"
        >
          <div className="stat-icon-bg gradient-warm">
            <UtensilsCrossed className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-elder-xl font-black text-foreground">{t('Did You Eat?', 'क्या आपने खाना खाया?')}</p>
            <p className="text-xs text-muted-foreground font-semibold">{t('Log your meals', 'अपना भोजन दर्ज करें')}</p>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Wellbeing */}
        <button
          onClick={() => navigate('/senior/wellbeing')}
          className="action-tile w-full bg-card text-foreground animate-slide-up-delay-3"
        >
          <div className="stat-icon-bg bg-accent">
            <SmilePlus className="w-5 h-5 text-accent-foreground" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-elder-xl font-black text-foreground">{t('How Are You?', 'आप कैसे हैं?')}</p>
            <p className="text-xs text-muted-foreground font-semibold">{t('Check in on your mood', 'अपना मूड दर्ज करें')}</p>
          </div>
          <ArrowRight className="w-5 h-5 text-muted-foreground" />
        </button>

        {/* Call Caregiver */}
        <button
          onClick={handleCall}
          className="action-tile w-full bg-card text-foreground border-2 border-primary/15 animate-slide-up-delay-4"
        >
          <div className="stat-icon-bg bg-primary/10">
            <Phone className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-elder-xl font-black text-foreground">{t('Call Caregiver', 'देखभालकर्ता को कॉल करें')}</p>
            <p className="text-xs text-muted-foreground font-semibold">{t('Tap to connect', 'कॉल करने के लिए टैप करें')}</p>
          </div>
        </button>

        {/* Emergency */}
        <button
          onClick={handleEmergency}
          className="action-tile w-full gradient-emergency text-destructive-foreground shadow-glow-emergency animate-slide-up-delay-5"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-elder-xl font-black">{t('EMERGENCY', 'आपातकालीन')}</p>
            <p className="text-xs font-semibold opacity-80">{t('Send alert to caregiver', 'देखभालकर्ता को अलर्ट भेजें')}</p>
          </div>
        </button>
      </div>
    </SeniorLayout>
  );
};

export default Home;
