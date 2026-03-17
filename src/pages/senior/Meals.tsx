import { useState, useEffect } from 'react';
import SeniorLayout from '@/components/SeniorLayout';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';
import * as db from '@/lib/database';

type MealType = 'breakfast' | 'lunch' | 'dinner';

const Meals = () => {
  const { t, currentUserId, role, linkedSenior } = useApp();
  const [mealsLogged, setMealsLogged] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const seniorId = role === 'senior' ? currentUserId : linkedSenior?.seniorId;

  // Load today's meal logs
  useEffect(() => {
    if (!seniorId) return;
    db.getTodayMealLogs(seniorId).then(logs => {
      const map: Record<string, boolean> = {};
      for (const l of logs) map[l.meal_type] = l.eaten;
      setMealsLogged(map);
      setLoading(false);
    });
  }, [seniorId]);

  const hour = new Date().getHours();
  const currentMeal: MealType = hour < 11 ? 'breakfast' : hour < 15 ? 'lunch' : 'dinner';
  const mealLabel: Record<MealType, [string, string]> = {
    breakfast: ['Breakfast', 'नाश्ता'],
    lunch: ['Lunch', 'दोपहर का खाना'],
    dinner: ['Dinner', 'रात का खाना'],
  };

  const handleMeal = async (meal: MealType, eaten: boolean) => {
    if (!seniorId) return;
    setMealsLogged(prev => ({ ...prev, [meal]: eaten }));
    await db.logMeal(seniorId, meal, eaten);
    if (eaten) {
      toast({ title: t('Great! Stay healthy!', 'बहुत बढ़िया! स्वस्थ रहें!') });
    } else {
      toast({ title: t('Reminder set for 30 minutes', '30 मिनट का रिमाइंडर सेट') });
    }
  };

  const alreadyAnswered = mealsLogged[currentMeal] !== undefined;

  return (
    <SeniorLayout title={t('Meal Check', 'भोजन जाँच')} showBack>
      <div className="space-y-6">
        {/* Current meal prompt */}
        <div className="flex flex-col items-center text-center">
          <span className="text-6xl mb-4 animate-slide-up">🍽️</span>
          <h2 className="text-elder-2xl font-black text-foreground animate-slide-up-delay-1">
            {t(`Have you had your ${mealLabel[currentMeal][0]}?`, `क्या आपने ${mealLabel[currentMeal][1]} खाया?`)}
          </h2>

          {!alreadyAnswered ? (
            <div className="w-full mt-8 space-y-4">
              <button onClick={() => handleMeal(currentMeal, true)} className="w-full elder-tile bg-success text-success-foreground text-elder-xl py-6 animate-slide-up-delay-2">
                ✅ {t('Yes, I ate!', 'हाँ, खा लिया!')}
              </button>
              <button onClick={() => handleMeal(currentMeal, false)} className="w-full elder-tile bg-secondary text-secondary-foreground text-elder-xl py-6 animate-slide-up-delay-3">
                ⏰ {t('Not Yet', 'अभी नहीं')}
              </button>
            </div>
          ) : (
            <div className="mt-8 animate-slide-up">
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">✅</span>
              </div>
              <p className="text-elder-lg text-muted-foreground font-semibold">
                {t('Recorded!', 'दर्ज किया गया!')}
              </p>
            </div>
          )}
        </div>

        {/* Today's meal status */}
        <div className="animate-slide-up-delay-4">
          <h3 className="text-sm font-black text-foreground mb-3">{t("Today's Meals", 'आज का भोजन')}</h3>
          <div className="grid grid-cols-3 gap-3">
            {(['breakfast', 'lunch', 'dinner'] as MealType[]).map((meal) => {
              const logged = mealsLogged[meal];
              const eaten = logged === true;
              const skipped = logged === false;
              return (
                <div
                  key={meal}
                  className={`glass-card rounded-2xl p-3 text-center ${
                    eaten ? 'ring-2 ring-success/30' : skipped ? 'ring-2 ring-warning/30' : ''
                  }`}
                >
                  <span className="text-2xl">{meal === 'breakfast' ? '🌅' : meal === 'lunch' ? '☀️' : '🌙'}</span>
                  <p className="text-xs font-bold text-foreground mt-1">{t(mealLabel[meal][0], mealLabel[meal][1])}</p>
                  <p className={`text-[10px] font-bold mt-0.5 ${
                    eaten ? 'text-success' : skipped ? 'text-warning' : 'text-muted-foreground'
                  }`}>
                    {eaten ? '✅' : skipped ? '⏰' : '—'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SeniorLayout>
  );
};

export default Meals;
