import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Clock } from 'lucide-react';
import SeniorLayout from '@/components/SeniorLayout';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import * as db from '@/lib/database';

type Mood = 'good' | 'okay' | 'not_well';
type MealType = 'breakfast' | 'lunch' | 'dinner';
type Step = 'mood' | 'pain' | 'medicines' | 'meals' | 'done';

const painAreas = [
  { en: 'Head', hi: 'सिर', emoji: '🤕' },
  { en: 'Chest', hi: 'छाती', emoji: '💔' },
  { en: 'Stomach', hi: 'पेट', emoji: '🤢' },
  { en: 'Back', hi: 'पीठ', emoji: '😣' },
  { en: 'Legs', hi: 'पैर', emoji: '🦵' },
  { en: 'Other', hi: 'अन्य', emoji: '📍' },
];

const mealLabel: Record<MealType, [string, string]> = {
  breakfast: ['Breakfast', 'नाश्ता'],
  lunch: ['Lunch', 'दोपहर का खाना'],
  dinner: ['Dinner', 'रात का खाना'],
};

// Proactive daily check-in — shown right after every login so the senior
// is asked how they're feeling / whether they've taken medicine / eaten,
// instead of having to navigate to each section themselves.
const DailyCheckIn = () => {
  const navigate = useNavigate();
  const {
    t, currentUserName, currentUserId, role, linkedSenior,
    setWellbeing, addAlert, sharedMedicines, markMedicineTaken,
  } = useApp();

  const seniorId = role === 'senior' ? currentUserId : linkedSenior?.seniorId;
  const { speak, cancel: cancelSpeech } = useTextToSpeech();

  const [step, setStep] = useState<Step>('mood');
  const [mealsLogged, setMealsLogged] = useState<Record<string, boolean>>({});
  const [mealsLoaded, setMealsLoaded] = useState(false);

  useEffect(() => {
    if (!seniorId) return;
    db.getTodayMealLogs(seniorId).then(logs => {
      const map: Record<string, boolean> = {};
      for (const l of logs) map[l.meal_type] = l.eaten;
      setMealsLogged(map);
      setMealsLoaded(true);
    });
  }, [seniorId]);

  const pendingMeds = useMemo(() => sharedMedicines.filter(m => !m.taken), [sharedMedicines]);

  const hour = new Date().getHours();
  const currentMeal: MealType = hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : 'dinner';
  const currentMealAnswered = mealsLogged[currentMeal] !== undefined;

  // Decide the next step given what's still actually pending to ask about.
  // While the meal-log fetch is still in flight, "not yet known to be
  // answered" must default to showing the meals step (not skipping it) —
  // the auto-skip effect below will fast-forward past it once the fetch
  // resolves and confirms it was already answered.
  const advance = (from: Step) => {
    if (from === 'mood' || from === 'pain') {
      if (pendingMeds.length > 0) return setStep('medicines');
      if (!(mealsLoaded && currentMealAnswered)) return setStep('meals');
      return setStep('done');
    }
    if (from === 'medicines') {
      if (!(mealsLoaded && currentMealAnswered)) return setStep('meals');
      return setStep('done');
    }
    setStep('done');
  };

  const handleMood = async (selected: Mood) => {
    if (selected === 'not_well') {
      setStep('pain');
      return;
    }
    await setWellbeing({ mood: selected, painArea: null, timestamp: new Date().toISOString() });
    toast({ title: selected === 'good' ? t('😊 Glad to hear!', '😊 सुनकर खुशी हुई!') : t('🙂 Take care!', '🙂 ध्यान रखें!') });
    advance('mood');
  };

  const handlePain = async (area: string) => {
    await setWellbeing({ mood: 'not_well', painArea: area, timestamp: new Date().toISOString() });
    await addAlert({
      type: 'distress',
      message: `Reported feeling unwell – ${area.toLowerCase()} area`,
      messageHi: `अस्वस्थ महसूस किया – ${area.toLowerCase()} क्षेत्र`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      severity: 'critical',
    });
    toast({
      title: t('🚨 Caregiver Alerted!', '🚨 देखभालकर्ता को सूचित किया गया!'),
      description: t(`Pain reported in: ${area}. Help is coming.`, `दर्द की जगह: ${area}। मदद आ रही है।`),
      variant: 'destructive',
    });
    advance('pain');
  };

  const handleTaken = async (id: string) => {
    await markMedicineTaken(id);
    toast({ title: t('✅ Medicine marked as taken!', '✅ दवाई ली गई!') });
  };

  const handleMeal = async (eaten: boolean) => {
    if (!seniorId) return;
    setMealsLogged(prev => ({ ...prev, [currentMeal]: eaten }));
    await db.logMeal(seniorId, currentMeal, eaten);
    toast({ title: eaten ? t('Great! Stay healthy!', 'बहुत बढ़िया! स्वस्थ रहें!') : t('Reminder set for 30 minutes', '30 मिनट का रिमाइंडर सेट') });
    advance('meals');
  };

  // If medicines/meals turn out to already be fully handled once loaded,
  // and we're sitting on a step with nothing left to ask, skip forward.
  useEffect(() => {
    if (step === 'medicines' && pendingMeds.length === 0) advance('medicines');
    if (step === 'meals' && mealsLoaded && currentMealAnswered) advance('meals');
  }, [step, pendingMeds.length, mealsLoaded, currentMealAnswered]);

  const firstName = currentUserName.split(' ')[0];

  // Speak each step's question as it becomes active — app speaks, user still
  // taps to answer. Keyed on `step` alone (not on pendingMeds/currentMeal) so
  // marking one medicine taken mid-step doesn't re-trigger/interrupt speech.
  useEffect(() => {
    if (step === 'mood') {
      speak(t(`Hi ${firstName}, how are you feeling today?`, `नमस्ते ${firstName}, आज आप कैसा महसूस कर रहे हैं?`));
    } else if (step === 'pain') {
      speak(t('Where does it hurt?', 'कहाँ दर्द हो रहा है?'));
    } else if (step === 'medicines') {
      const names = pendingMeds.map(m => t(m.name, m.nameHi || m.name)).join(', ');
      speak(t(`Have you taken these? ${names}.`, `क्या आपने ये ले ली हैं? ${names}।`));
    } else if (step === 'meals') {
      speak(t(`Have you had your ${mealLabel[currentMeal][0]}?`, `क्या आपने ${mealLabel[currentMeal][1]} खाया?`));
    } else if (step === 'done') {
      speak(t('All set for now! Thanks for checking in.', 'अभी के लिए सब ठीक है! जाँच करने के लिए धन्यवाद।'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Stop any in-flight speech if the senior navigates away mid check-in.
  useEffect(() => () => cancelSpeech(), [cancelSpeech]);

  return (
    <SeniorLayout title={t('Daily Check-In', 'दैनिक जाँच')}>
      {step === 'mood' && (
        <div className="flex flex-col items-center text-center">
          <span className="text-6xl mb-4 animate-slide-up">💭</span>
          <h2 className="text-elder-2xl font-black text-foreground mb-2 animate-slide-up-delay-1">
            {t(`Hi ${firstName}, how are you feeling today?`, `नमस्ते ${firstName}, आज आप कैसा महसूस कर रहे हैं?`)}
          </h2>
          <div className="w-full mt-8 space-y-4">
            <button onClick={() => handleMood('good')} className="w-full elder-tile bg-success text-success-foreground text-elder-xl py-6 animate-slide-up-delay-2">
              😊 {t('Good', 'अच्छा')}
            </button>
            <button onClick={() => handleMood('okay')} className="w-full elder-tile bg-secondary text-secondary-foreground text-elder-xl py-6 animate-slide-up-delay-3">
              🙂 {t('Okay', 'ठीक')}
            </button>
            <button onClick={() => handleMood('not_well')} className="w-full elder-tile gradient-emergency text-destructive-foreground text-elder-xl py-6 shadow-glow-emergency animate-slide-up-delay-4">
              😟 {t('Not Well', 'अच्छा नहीं')}
            </button>
          </div>
        </div>
      )}

      {step === 'pain' && (
        <div className="flex flex-col items-center text-center">
          <span className="text-5xl mb-4 animate-slide-up">😟</span>
          <h2 className="text-elder-xl font-black text-foreground mb-6 animate-slide-up-delay-1">
            {t('Where does it hurt?', 'कहाँ दर्द हो रहा है?')}
          </h2>
          <div className="w-full grid grid-cols-2 gap-3">
            {painAreas.map((area, i) => (
              <button
                key={area.en}
                onClick={() => handlePain(area.en)}
                className={`elder-tile bg-card text-foreground flex-col gap-2 py-5 border-2 border-destructive/20 animate-slide-up-delay-${Math.min(i + 1, 5)}`}
              >
                <span className="text-2xl">{area.emoji}</span>
                <span className="text-elder-lg">{t(area.en, area.hi)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'medicines' && (
        <div className="space-y-4">
          <div className="text-center mb-2">
            <span className="text-5xl mb-4 block animate-slide-up">💊</span>
            <h2 className="text-elder-2xl font-black text-foreground animate-slide-up-delay-1">
              {t('Have you taken these?', 'क्या आपने ये ले ली हैं?')}
            </h2>
          </div>
          {pendingMeds.map((med, i) => (
            <div key={med.id} className={`bg-card rounded-elder p-5 shadow-card border-2 border-warning/20 animate-slide-up-delay-${Math.min(i + 1, 5)}`}>
              <div className="mb-3">
                <h3 className="text-elder-lg font-bold text-foreground">{t(med.name, med.nameHi)}</h3>
                <p className="text-muted-foreground font-semibold">🕐 {med.timing} · {med.dosage}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => handleTaken(med.id)} className="flex-1 elder-tile bg-success text-success-foreground py-3 min-h-0 text-base">
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
          ))}
          <button
            onClick={() => advance('medicines')}
            className="w-full py-3 rounded-elder border border-border bg-card text-foreground font-bold text-sm mt-2"
          >
            {t('Continue', 'जारी रखें')}
          </button>
        </div>
      )}

      {step === 'meals' && (
        <div className="flex flex-col items-center text-center">
          <span className="text-6xl mb-4 animate-slide-up">🍽️</span>
          <h2 className="text-elder-2xl font-black text-foreground animate-slide-up-delay-1">
            {t(`Have you had your ${mealLabel[currentMeal][0]}?`, `क्या आपने ${mealLabel[currentMeal][1]} खाया?`)}
          </h2>
          <div className="w-full mt-8 space-y-4">
            <button onClick={() => handleMeal(true)} className="w-full elder-tile bg-success text-success-foreground text-elder-xl py-6 animate-slide-up-delay-2">
              ✅ {t('Yes, I ate!', 'हाँ, खा लिया!')}
            </button>
            <button onClick={() => handleMeal(false)} className="w-full elder-tile bg-secondary text-secondary-foreground text-elder-xl py-6 animate-slide-up-delay-3">
              ⏰ {t('Not Yet', 'अभी नहीं')}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="min-h-[50vh] flex flex-col items-center justify-center animate-slide-up">
          <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mb-4">
            <span className="text-4xl">✅</span>
          </div>
          <h2 className="text-elder-xl font-black text-foreground">
            {t("All set for now!", 'अभी के लिए सब ठीक है!')}
          </h2>
          <p className="text-muted-foreground font-semibold mt-2 mb-8 text-center">
            {t('Thanks for checking in.', 'जाँच करने के लिए धन्यवाद।')}
          </p>
          <button
            onClick={() => navigate('/senior', { replace: true })}
            className="w-full elder-tile gradient-primary text-primary-foreground text-elder-lg py-4"
          >
            {t('Go to My Dashboard', 'मेरे डैशबोर्ड पर जाएं')}
          </button>
        </div>
      )}
    </SeniorLayout>
  );
};

export default DailyCheckIn;
