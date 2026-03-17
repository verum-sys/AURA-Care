import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pill, Check, Calendar, SmilePlus, UtensilsCrossed } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import LanguageToggle from '@/components/LanguageToggle';
import * as db from '@/lib/database';

const moodEmoji: Record<string, string> = { good: '😊', okay: '🙂', not_well: '😟' };
const moodLabel: Record<string, [string, string]> = {
  good: ['Good', 'अच्छा'], okay: ['Okay', 'ठीक'], not_well: ['Not Well', 'अच्छा नहीं'],
};

interface DayData {
  date: string;
  meds: db.DBMedicineLog[];
  meals: db.DBMealLog[];
  mood: db.DBWellbeing | null;
}

function formatDate(dateStr: string, lang: 'en' | 'hi'): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return lang === 'en' ? 'Today' : 'आज';
  if (d.toDateString() === yesterday.toDateString()) return lang === 'en' ? 'Yesterday' : 'कल';
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

const MedicineHistory = () => {
  const navigate = useNavigate();
  const { t, language, sharedMedicines, activeSeniorId, currentUserId, role } = useApp();
  const [days, setDays] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);

  const seniorId = role === 'senior' ? currentUserId : activeSeniorId;
  const totalMeds = sharedMedicines.length;

  const load = useCallback(async () => {
    if (!seniorId) return;
    setLoading(true);
    const [medLogs, mealLogs, wellLogs] = await Promise.all([
      db.getMedicineHistory(seniorId, 30),
      db.getMealHistory(seniorId, 30),
      db.getWellbeingHistory(seniorId, 30),
    ]);

    // Collect all unique dates
    const dateSet = new Set<string>();
    medLogs.forEach(l => dateSet.add(l.taken_date));
    mealLogs.forEach(l => dateSet.add(l.log_date));
    wellLogs.forEach(w => dateSet.add(new Date(w.created_at).toISOString().slice(0, 10)));

    const sorted = [...dateSet].sort((a, b) => b.localeCompare(a));

    const result: DayData[] = sorted.map(date => ({
      date,
      meds: medLogs.filter(l => l.taken_date === date),
      meals: mealLogs.filter(l => l.log_date === date),
      mood: wellLogs.find(w => new Date(w.created_at).toISOString().slice(0, 10) === date) ?? null,
    }));

    setDays(result);
    setLoading(false);
  }, [seniorId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      <header className="flex items-center justify-between px-5 py-3.5 bg-card/95 backdrop-blur-md border-b border-border sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition-all">
            <ArrowLeft className="w-6 h-6 text-foreground" />
          </button>
          <h1 className="text-lg font-extrabold text-foreground">
            {t('Daily History', 'दैनिक इतिहास')}
          </h1>
        </div>
        <LanguageToggle />
      </header>

      <main className="flex-1 px-5 py-5 pb-10">
        {loading ? (
          <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground text-sm">
            {t('Loading...', 'लोड हो रहा...')}
          </div>
        ) : days.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <Calendar className="w-10 h-10 text-muted-foreground mb-3" />
            <h2 className="text-lg font-black text-foreground">{t('No history yet', 'अभी कोई इतिहास नहीं')}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t('Records will appear here as activities are logged.', 'गतिविधियाँ दर्ज होने पर यहाँ दिखेंगी।')}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {days.map((day) => {
              const adherence = totalMeds > 0 ? Math.round((day.meds.length / totalMeds) * 100) : 0;
              const eatenMeals = day.meals.filter(m => m.eaten);

              return (
                <div key={day.date} className="animate-slide-up">
                  {/* Date header */}
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-sm font-black text-foreground">
                      {formatDate(day.date, language)}
                    </span>
                    <span className="text-[10px] font-bold text-muted-foreground">
                      {day.date}
                    </span>
                  </div>

                  <div className="glass-card rounded-2xl p-4 space-y-3">
                    {/* Medicines */}
                    {day.meds.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Pill className="w-4 h-4 text-primary" />
                          <span className="text-xs font-bold text-foreground">{t('Medicines', 'दवाइयाँ')}</span>
                          <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            adherence >= 100 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
                          }`}>
                            {day.meds.length}/{totalMeds}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {day.meds.map(log => (
                            <div key={log.id} className="flex items-center gap-2.5 pl-6">
                              <Check className="w-3.5 h-3.5 text-success flex-shrink-0" />
                              <span className="text-xs font-semibold text-foreground flex-1 truncate">{log.medicine_name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(log.taken_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mood */}
                    {day.mood && (
                      <div className="flex items-center gap-2">
                        <SmilePlus className="w-4 h-4 text-secondary" />
                        <span className="text-xs font-bold text-foreground">{t('Mood', 'मूड')}</span>
                        <span className="ml-auto text-sm">{moodEmoji[day.mood.mood]}</span>
                        <span className="text-xs text-muted-foreground font-semibold">
                          {t(moodLabel[day.mood.mood]?.[0] ?? '', moodLabel[day.mood.mood]?.[1] ?? '')}
                          {day.mood.pain_area && ` — ${day.mood.pain_area}`}
                        </span>
                      </div>
                    )}

                    {/* Meals */}
                    {day.meals.length > 0 && (
                      <div className="flex items-center gap-2">
                        <UtensilsCrossed className="w-4 h-4 text-warning" />
                        <span className="text-xs font-bold text-foreground">{t('Meals', 'भोजन')}</span>
                        <div className="ml-auto flex gap-1">
                          {['breakfast', 'lunch', 'dinner'].map(mt => {
                            const logged = day.meals.find(m => m.meal_type === mt);
                            return (
                              <span key={mt} className={`w-5 h-5 rounded text-[8px] font-black flex items-center justify-center ${
                                logged?.eaten ? 'bg-success text-white' : 'bg-muted text-muted-foreground'
                              }`}>
                                {mt[0].toUpperCase()}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Empty day */}
                    {day.meds.length === 0 && !day.mood && day.meals.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">{t('No activity recorded', 'कोई गतिविधि दर्ज नहीं')}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default MedicineHistory;
