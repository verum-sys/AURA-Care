import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import SeniorLayout from '@/components/SeniorLayout';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import * as db from '@/lib/database';

type Mood = 'good' | 'okay' | 'not_well';
type MealType = 'breakfast' | 'lunch' | 'dinner';
type Step = 'loading' | 'mood' | 'pain' | 'item' | 'done';

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

interface MedicineQueueItem {
  kind: 'medicine';
  medicineId: string;
  name: string;
  nameHi: string;
  dosage: string;
  slot: string;
  minutes: number;
}
interface MealQueueItem {
  kind: 'meal';
  meal: MealType;
  minutes: number;
}
type QueueItem = MedicineQueueItem | MealQueueItem;

function timeStrToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

const DEFAULT_ROUTINE_TIMES: Record<MealType, string> = {
  breakfast: '08:00',
  lunch: '13:00',
  dinner: '20:00',
};

// Proactive daily check-in — shown right after every login. Rather than
// asking a fixed script every time, it builds a queue of only what's
// actually due-and-unanswered as of right now: mood once per day, each
// medicine dose whose scheduled time has passed and hasn't been logged
// (so a missed 1pm dose and a missed 5pm dose are both asked about,
// separately, if the app isn't opened until 9pm), and each meal whose
// routine time has passed and isn't logged yet. Anything already answered
// — via this screen, the Medicines/Meals pages, or (once wired) a
// notification action — is read straight from the DB, so it's never asked
// twice.
const DailyCheckIn = () => {
  const navigate = useNavigate();
  const {
    t, currentUserName, currentUserId, role, linkedSenior,
    setWellbeing, addAlert, sharedMedicines, wellbeing, seniorRoutine, logMedicineSlot,
  } = useApp();

  const seniorId = role === 'senior' ? currentUserId : linkedSenior?.seniorId;
  const { speak, cancel: cancelSpeech } = useTextToSpeech();

  const [step, setStep] = useState<Step>('loading');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);

  const answeredMoodToday = useMemo(() => {
    if (!wellbeing?.timestamp) return false;
    return new Date(wellbeing.timestamp).toDateString() === new Date().toDateString();
  }, [wellbeing]);

  // Build the due-and-unanswered queue once meal + medicine-slot logs are
  // in. Re-runs if the medicine list changes (e.g. a caregiver added one
  // while this was open), but not on a timer — the queue is a snapshot for
  // this visit, same as the rest of the app.
  useEffect(() => {
    if (!seniorId) return;
    let cancelled = false;

    (async () => {
      const [mealLogs, slotLogs] = await Promise.all([
        db.getTodayMealLogs(seniorId),
        db.getTodayMedicineSlotLogs(seniorId),
      ]);
      if (cancelled) return;

      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const loggedMeals = new Set(mealLogs.map(l => l.meal_type));
      const loggedSlots = new Set(slotLogs.map(l => `${l.medicine_id}|${l.slot}`));

      const items: QueueItem[] = [];

      for (const med of sharedMedicines) {
        const slots = med.timing.split(',').map(s => s.trim()).filter(Boolean);
        for (const slot of slots) {
          const minutes = timeStrToMinutes(slot);
          if (minutes > nowMinutes) continue; // not due yet
          if (loggedSlots.has(`${med.id}|${slot}`)) continue; // already answered
          items.push({
            kind: 'medicine',
            medicineId: med.id,
            name: med.name,
            nameHi: med.nameHi || med.name,
            dosage: med.dosage,
            slot,
            minutes,
          });
        }
      }

      const mealAnchors: [MealType, string][] = [
        ['breakfast', seniorRoutine?.breakfastTime ?? DEFAULT_ROUTINE_TIMES.breakfast],
        ['lunch', seniorRoutine?.lunchTime ?? DEFAULT_ROUTINE_TIMES.lunch],
        ['dinner', seniorRoutine?.dinnerTime ?? DEFAULT_ROUTINE_TIMES.dinner],
      ];
      for (const [meal, timeStr] of mealAnchors) {
        const minutes = timeStrToMinutes(timeStr);
        if (minutes > nowMinutes) continue; // not due yet
        if (loggedMeals.has(meal)) continue; // already answered
        items.push({ kind: 'meal', meal, minutes });
      }

      items.sort((a, b) => a.minutes - b.minutes);
      setQueue(items);
      setQueueIndex(0);
      setStep(!answeredMoodToday ? 'mood' : items.length > 0 ? 'item' : 'done');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();

    return () => { cancelled = true; };
    // Deliberately excludes answeredMoodToday/wellbeing — mood is checked
    // once here at build time; answering it moves the step forward directly
    // (advancePastMood) rather than re-running this whole fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seniorId, sharedMedicines, seniorRoutine]);

  const currentItem = queue[queueIndex];

  const advancePastMood = () => {
    setStep(queue.length > 0 ? 'item' : 'done');
  };

  const advanceQueue = () => {
    if (queueIndex + 1 < queue.length) setQueueIndex(i => i + 1);
    else setStep('done');
  };

  const handleMood = async (selected: Mood) => {
    if (selected === 'not_well') {
      setStep('pain');
      return;
    }
    await setWellbeing({ mood: selected, painArea: null, timestamp: new Date().toISOString() });
    toast({ title: selected === 'good' ? t('😊 Glad to hear!', '😊 सुनकर खुशी हुई!') : t('🙂 Take care!', '🙂 ध्यान रखें!') });
    advancePastMood();
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
    advancePastMood();
  };

  const handleMedicineAnswer = async (item: MedicineQueueItem, taken: boolean) => {
    if (taken) {
      await logMedicineSlot(item.medicineId, item.slot);
      toast({ title: t('✅ Medicine marked as taken!', '✅ दवाई ली गई!') });
    } else {
      toast({ title: t("No problem, we'll check again later.", 'कोई बात नहीं, बाद में फिर पूछेंगे।') });
    }
    advanceQueue();
  };

  const handleMealAnswer = async (item: MealQueueItem, eaten: boolean) => {
    if (!seniorId) return;
    await db.logMeal(seniorId, item.meal, eaten);
    toast({
      title: eaten
        ? t('Great! Stay healthy!', 'बहुत बढ़िया! स्वस्थ रहें!')
        : t("Got it, we'll check again later.", 'ठीक है, बाद में फिर पूछेंगे।'),
    });
    advanceQueue();
  };

  const firstName = currentUserName.split(' ')[0];

  // Speak each step's question as it becomes active — app speaks, user still
  // taps to answer.
  useEffect(() => {
    if (step === 'mood') {
      speak(t(`Hi ${firstName}, how are you feeling today?`, `नमस्ते ${firstName}, आज आप कैसा महसूस कर रहे हैं?`));
    } else if (step === 'pain') {
      speak(t('Where does it hurt?', 'कहाँ दर्द हो रहा है?'));
    } else if (step === 'item' && currentItem) {
      if (currentItem.kind === 'medicine') {
        speak(t(`Have you taken ${currentItem.name}?`, `क्या आपने ${currentItem.nameHi} ले ली?`));
      } else {
        speak(t(`Have you had your ${mealLabel[currentItem.meal][0]}?`, `क्या आपने ${mealLabel[currentItem.meal][1]} खाया?`));
      }
    } else if (step === 'done') {
      speak(t('All set for now! Thanks for checking in.', 'अभी के लिए सब ठीक है! जाँच करने के लिए धन्यवाद।'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, queueIndex]);

  // Stop any in-flight speech if the senior navigates away mid check-in.
  useEffect(() => () => cancelSpeech(), [cancelSpeech]);

  return (
    <SeniorLayout title={t('Daily Check-In', 'दैनिक जाँच')}>
      {step === 'loading' && (
        <div className="min-h-[50vh] flex items-center justify-center">
          <span className="text-4xl animate-pulse">⏳</span>
        </div>
      )}

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

      {step === 'item' && currentItem?.kind === 'medicine' && (
        <div className="flex flex-col items-center text-center">
          <span className="text-6xl mb-4 animate-slide-up">💊</span>
          <h2 className="text-elder-2xl font-black text-foreground animate-slide-up-delay-1">
            {t(`Have you taken ${currentItem.name}?`, `क्या आपने ${currentItem.nameHi} ले ली?`)}
          </h2>
          <p className="text-muted-foreground font-semibold mt-2 animate-slide-up-delay-2">
            🕐 {currentItem.slot} · {currentItem.dosage}
          </p>
          <div className="w-full mt-8 space-y-4">
            <button onClick={() => handleMedicineAnswer(currentItem, true)} className="w-full elder-tile bg-success text-success-foreground text-elder-xl py-6 animate-slide-up-delay-3">
              <Check className="w-6 h-6 mr-2 inline" /> {t('Yes, taken', 'हाँ, ली गई')}
            </button>
            <button onClick={() => handleMedicineAnswer(currentItem, false)} className="w-full elder-tile bg-secondary text-secondary-foreground text-elder-xl py-6 animate-slide-up-delay-4">
              ⏰ {t('Not Yet', 'अभी नहीं')}
            </button>
          </div>
        </div>
      )}

      {step === 'item' && currentItem?.kind === 'meal' && (
        <div className="flex flex-col items-center text-center">
          <span className="text-6xl mb-4 animate-slide-up">🍽️</span>
          <h2 className="text-elder-2xl font-black text-foreground animate-slide-up-delay-1">
            {t(`Have you had your ${mealLabel[currentItem.meal][0]}?`, `क्या आपने ${mealLabel[currentItem.meal][1]} खाया?`)}
          </h2>
          <div className="w-full mt-8 space-y-4">
            <button onClick={() => handleMealAnswer(currentItem, true)} className="w-full elder-tile bg-success text-success-foreground text-elder-xl py-6 animate-slide-up-delay-2">
              ✅ {t('Yes, I ate!', 'हाँ, खा लिया!')}
            </button>
            <button onClick={() => handleMealAnswer(currentItem, false)} className="w-full elder-tile bg-secondary text-secondary-foreground text-elder-xl py-6 animate-slide-up-delay-3">
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
            {t('All set for now!', 'अभी के लिए सब ठीक है!')}
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
