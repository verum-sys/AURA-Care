import { useNavigate } from 'react-router-dom';
import { Check, Clock, Pill, Utensils, History } from 'lucide-react';
import SeniorLayout from '@/components/SeniorLayout';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';

const Medicines = () => {
  const navigate = useNavigate();
  const { t, sharedMedicines, markMedicineTaken } = useApp();

  const pendingMeds = sharedMedicines.filter(m => !m.taken);
  const takenMeds = sharedMedicines.filter(m => m.taken);

  const handleTaken = async (id: string) => {
    await markMedicineTaken(id);
    toast({ title: t('✅ Medicine marked as taken!', '✅ दवाई ली गई!') });
  };

  const getFoodTag = (type: 'before' | 'after' | 'with' | 'any') => {
    switch (type) {
      case 'before': return { en: 'Before Food', hi: 'खाने से पहले', style: 'bg-secondary text-secondary-foreground' };
      case 'after': return { en: 'After Food', hi: 'खाने के बाद', style: 'bg-accent text-accent-foreground' };
      case 'with': return { en: 'With Food', hi: 'खाने के साथ', style: 'bg-primary/10 text-primary' };
      case 'any': return { en: 'Any Time', hi: 'कभी भी', style: 'bg-muted text-muted-foreground' };
    }
  };

  if (sharedMedicines.length === 0) {
    return (
      <SeniorLayout title={t('My Medicines', 'मेरी दवाइयाँ')} showBack>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
            <Pill className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-elder-xl font-black text-foreground">
            {t('No Medicines Yet', 'अभी कोई दवाई नहीं')}
          </h2>
          <p className="text-muted-foreground font-semibold mt-2 max-w-xs">
            {t(
              'Your caregiver will upload your prescription and medicines will appear here.',
              'आपका देखभालकर्ता आपका प्रिस्क्रिप्शन अपलोड करेगा और दवाइयाँ यहाँ दिखेंगी।'
            )}
          </p>
        </div>
      </SeniorLayout>
    );
  }

  return (
    <SeniorLayout title={t('My Medicines', 'मेरी दवाइयाँ')} showBack>
      <div className="space-y-6">
        {/* Section 1: Did You Eat? (Pending medicines) */}
        {pendingMeds.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Utensils className="w-5 h-5 text-warning" />
              <h2 className="text-elder-lg font-black text-foreground">
                {t('Did You Take?', 'क्या आपने ली?')}
              </h2>
              <span className="ml-auto px-3 py-1 rounded-full bg-warning/10 text-warning text-xs font-bold">
                {pendingMeds.length} {t('pending', 'बाकी')}
              </span>
            </div>
            <div className="space-y-3">
              {pendingMeds.map((med, i) => {
                const tag = getFoodTag(med.beforeAfterFood);
                return (
                  <div
                    key={med.id}
                    className={`bg-card rounded-elder p-5 shadow-card border-2 border-warning/20 animate-slide-up-delay-${Math.min(i + 1, 5)}`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-elder-lg font-bold text-foreground">{t(med.name, med.nameHi)}</h3>
                        <p className="text-muted-foreground font-semibold">🕐 {med.timing}</p>
                        <p className="text-sm text-muted-foreground">{med.dosage} · {med.frequency}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${tag.style}`}>
                        {t(tag.en, tag.hi)}
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleTaken(med.id)}
                        className="flex-1 elder-tile bg-success text-success-foreground py-3 min-h-0 text-base"
                      >
                        <Check className="w-5 h-5 mr-2" />
                        {t('Taken', 'ली गई')}
                      </button>
                      <button
                        onClick={() => toast({ title: t('⏰ Reminder set for 30 minutes', '⏰ 30 मिनट का रिमाइंडर सेट') })}
                        className="flex-1 elder-tile bg-muted text-foreground py-3 min-h-0 text-base"
                      >
                        <Clock className="w-5 h-5 mr-2" />
                        {t('Remind Later', 'बाद में याद दिलाएं')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Section 2: My Medicines (All medicines list / Taken) */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Pill className="w-5 h-5 text-primary" />
            <h2 className="text-elder-lg font-black text-foreground">
              {t('My Medicines', 'मेरी दवाइयाँ')}
            </h2>
            <span className="ml-auto px-3 py-1 rounded-full bg-success/10 text-success text-xs font-bold">
              {takenMeds.length}/{sharedMedicines.length} {t('taken', 'ली गई')}
            </span>
          </div>
          <div className="space-y-3">
            {sharedMedicines.map((med, i) => {
              const tag = getFoodTag(med.beforeAfterFood);
              return (
                <div
                  key={med.id}
                  className={`bg-card rounded-elder p-4 shadow-card ${med.taken ? 'opacity-70 border-l-4 border-l-success' : 'border-l-4 border-l-warning'}`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-foreground">{t(med.name, med.nameHi)}</h3>
                      <p className="text-sm text-muted-foreground">
                        {med.dosage} · {med.timing} · <span className={`${med.beforeAfterFood === 'before' ? 'text-warning' : 'text-success'}`}>{t(tag.en, tag.hi)}</span>
                      </p>
                    </div>
                    {med.taken ? (
                      <div className="flex items-center gap-1 text-success font-bold text-sm">
                        <Check className="w-5 h-5" />
                        {t('Done', 'हो गई')}
                      </div>
                    ) : (
                      <button
                        type="button"
                        title={t('Mark as taken', 'ली गई चिह्नित करें')}
                        onClick={() => handleTaken(med.id)}
                        className="px-3 py-2 rounded-lg bg-success text-success-foreground text-sm font-bold"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* All taken message */}
        {pendingMeds.length === 0 && (
          <div className="bg-success/10 rounded-elder p-5 text-center border border-success/20">
            <span className="text-4xl">🎉</span>
            <h3 className="text-elder-lg font-black text-success mt-2">
              {t('All medicines taken!', 'सभी दवाइयाँ ली गईं!')}
            </h3>
            <p className="text-muted-foreground font-semibold mt-1">
              {t('Great job! Stay healthy.', 'शाबाश! स्वस्थ रहें।')}
            </p>
          </div>
        )}

        {/* View History */}
        <button
          onClick={() => navigate('/history')}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-elder border border-border bg-card text-foreground font-bold text-sm hover:bg-muted transition-all"
        >
          <History className="w-4 h-4 text-primary" />
          {t('View Medicine History', 'दवाई इतिहास देखें')}
        </button>
      </div>
    </SeniorLayout>
  );
};

export default Medicines;
