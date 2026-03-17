import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Pill, SmilePlus, UtensilsCrossed, Calendar, TrendingUp } from 'lucide-react';
import CaregiverLayout from '@/components/CaregiverLayout';
import { useApp } from '@/context/AppContext';
import * as db from '@/lib/database';

const moodEmoji: Record<string, string> = { good: '😊', okay: '🙂', not_well: '😟' };
const moodScore: Record<string, number> = { good: 3, okay: 2, not_well: 1 };
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DaySummary {
  day: string;       // 'Mon', 'Tue' etc
  date: string;      // 'YYYY-MM-DD'
  medsTaken: number;
  medsTotal: number;
  adherence: number;
  mood: string | null;  // 'good' | 'okay' | 'not_well' | null
  moodScore: number;
  mealsEaten: number;   // out of 3
}

const Analytics = () => {
  const { t, sharedMedicines, activeSeniorId } = useApp();
  const [data, setData] = useState<DaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const totalMedsPerDay = sharedMedicines.length;

  const loadInsights = useCallback(async () => {
    if (!activeSeniorId) return;
    setLoading(true);

    const [medLogs, mealLogs, wellLogs] = await Promise.all([
      db.getMedicineHistory(activeSeniorId, 7),
      db.getMealHistory(activeSeniorId, 7),
      db.getWellbeingHistory(activeSeniorId, 7),
    ]);

    // Build last 7 days
    const days: DaySummary[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = dayNames[d.getDay()];

      const dayMeds = medLogs.filter(l => l.taken_date === dateStr);
      const dayMeals = mealLogs.filter(l => l.log_date === dateStr && l.eaten);
      // Wellbeing: pick the latest for that day
      const dayWell = wellLogs.find(w =>
        new Date(w.created_at).toISOString().slice(0, 10) === dateStr
      );

      const taken = dayMeds.length;
      const adherence = totalMedsPerDay > 0 ? Math.round((taken / totalMedsPerDay) * 100) : 0;

      days.push({
        day: dayLabel,
        date: dateStr,
        medsTaken: taken,
        medsTotal: totalMedsPerDay,
        adherence: Math.min(adherence, 100),
        mood: dayWell?.mood ?? null,
        moodScore: dayWell ? (moodScore[dayWell.mood] ?? 0) : 0,
        mealsEaten: dayMeals.length,
      });
    }

    setData(days);
    setLoading(false);
  }, [activeSeniorId, totalMedsPerDay]);

  useEffect(() => { loadInsights(); }, [loadInsights]);

  // Summaries
  const avgAdherence = data.length > 0
    ? Math.round(data.reduce((s, d) => s + d.adherence, 0) / data.length)
    : 0;

  const moodDays = data.filter(d => d.mood);
  const avgMoodScore = moodDays.length > 0
    ? Math.round(moodDays.reduce((s, d) => s + d.moodScore, 0) / moodDays.length)
    : 0;
  const avgMoodEmoji = avgMoodScore >= 3 ? '😊' : avgMoodScore >= 2 ? '🙂' : avgMoodScore >= 1 ? '😟' : '—';

  const totalMeals = data.reduce((s, d) => s + d.mealsEaten, 0);
  const maxMeals = data.length * 3;
  const mealPercent = maxMeals > 0 ? Math.round((totalMeals / maxMeals) * 100) : 0;

  return (
    <CaregiverLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-2 animate-slide-up">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-black text-foreground">{t('Weekly Insights', 'साप्ताहिक विश्लेषण')}</h2>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 animate-slide-up-delay-1">
          <div className="glass-card rounded-2xl p-3 text-center">
            <div className="stat-icon-bg bg-primary/10 mx-auto mb-2">
              <Pill className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xl font-black text-primary">{avgAdherence}%</p>
            <p className="text-[10px] font-bold text-muted-foreground">{t('Medicine', 'दवाई')}</p>
          </div>
          <div className="glass-card rounded-2xl p-3 text-center">
            <div className="stat-icon-bg bg-secondary/10 mx-auto mb-2">
              <SmilePlus className="w-4 h-4 text-secondary" />
            </div>
            <p className="text-xl font-black">{avgMoodEmoji}</p>
            <p className="text-[10px] font-bold text-muted-foreground">{t('Avg Mood', 'औसत मूड')}</p>
          </div>
          <div className="glass-card rounded-2xl p-3 text-center">
            <div className="stat-icon-bg bg-warning/10 mx-auto mb-2">
              <UtensilsCrossed className="w-4 h-4 text-warning" />
            </div>
            <p className="text-xl font-black text-warning">{mealPercent}%</p>
            <p className="text-[10px] font-bold text-muted-foreground">{t('Meals', 'भोजन')}</p>
          </div>
        </div>

        {/* Medicine Adherence Chart */}
        <div className="glass-card rounded-2xl p-5 animate-slide-up-delay-2">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <Pill className="w-4 h-4 text-primary" />
            {t('Medicine Adherence', 'दवाई पालन')}
          </h3>
          {loading ? (
            <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">{t('Loading...', 'लोड हो रहा...')}</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 88%)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fontWeight: 700 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => [`${v}%`, t('Adherence', 'पालन')]} />
                <Bar dataKey="adherence" fill="hsl(173, 58%, 39%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Mood Timeline */}
        <div className="glass-card rounded-2xl p-5 animate-slide-up-delay-3">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <SmilePlus className="w-4 h-4 text-secondary" />
            {t('Mood This Week', 'इस हफ्ते का मूड')}
          </h3>
          <div className="flex justify-between">
            {data.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-1">
                <span className="text-xl">{d.mood ? moodEmoji[d.mood] : '·'}</span>
                <span className="text-[10px] font-bold text-muted-foreground">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Meal Tracker */}
        <div className="glass-card rounded-2xl p-5 animate-slide-up-delay-4">
          <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-warning" />
            {t('Meals This Week', 'इस हफ्ते का भोजन')}
          </h3>
          <div className="flex justify-between">
            {data.map((d) => (
              <div key={d.date} className="flex flex-col items-center gap-1.5">
                <div className="flex flex-col gap-0.5">
                  {['B', 'L', 'D'].map((label, i) => {
                    const mealTypes = ['breakfast', 'lunch', 'dinner'] as const;
                    // Check if this specific meal was eaten
                    const eaten = d.mealsEaten > i; // approximate — logs don't have per-meal here
                    return (
                      <span
                        key={label}
                        className={`w-5 h-5 rounded text-[8px] font-black flex items-center justify-center ${
                          eaten ? 'bg-success text-white' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
                <span className="text-[10px] font-bold text-muted-foreground">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Daily breakdown */}
        <div className="glass-card rounded-2xl p-5 animate-slide-up-delay-5">
          <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            {t('Daily Summary', 'दैनिक सारांश')}
          </h3>
          <div className="space-y-2">
            {[...data].reverse().map((d) => {
              const today = new Date().toISOString().slice(0, 10);
              const label = d.date === today ? t('Today', 'आज') : d.day;
              return (
                <div key={d.date} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <span className="text-xs font-black text-muted-foreground w-8">{label}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-xs">💊 {d.medsTaken}/{d.medsTotal}</span>
                    <span className="text-xs">{d.mood ? moodEmoji[d.mood] : '·'}</span>
                    <span className="text-xs">🍽️ {d.mealsEaten}/3</span>
                  </div>
                  <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full gradient-primary"
                      style={{ width: `${d.adherence}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </CaregiverLayout>
  );
};

export default Analytics;
