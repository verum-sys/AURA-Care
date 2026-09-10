import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Pill, SmilePlus, UtensilsCrossed, Check, X, Minus } from 'lucide-react';
import CaregiverLayout from '@/components/CaregiverLayout';
import { useApp } from '@/context/AppContext';
import * as db from '@/lib/database';

type Kind = 'medicines' | 'wellbeing' | 'meals';
type Range = 'week' | 'month';
type Lang = 'en' | 'hi';
type Mood = db.DBWellbeing['mood'];

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;
type MealType = typeof MEAL_TYPES[number];

const mealLabel: Record<MealType, [string, string]> = {
  breakfast: ['Breakfast', 'नाश्ता'],
  lunch: ['Lunch', 'दोपहर का खाना'],
  dinner: ['Dinner', 'रात का खाना'],
};
const moodEmoji: Record<Mood, string> = { good: '😊', okay: '🙂', not_well: '😟' };
const moodLabel: Record<Mood, [string, string]> = {
  good: ['Good', 'अच्छा'],
  okay: ['Okay', 'ठीक'],
  not_well: ['Not Well', 'अच्छा नहीं'],
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const dayOf = (iso: string) => isoDay(new Date(iso));
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Yesterday back to (days - 1) days ago — today gets its own section. */
function pastDayKeys(days: number): string[] {
  return Array.from({ length: days - 1 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (i + 1));
    return isoDay(d);
  });
}

function dayLabel(key: string, lang: Lang): string {
  const d = new Date(key + 'T00:00:00');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return lang === 'hi' ? 'कल' : 'Yesterday';
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Complete literal class strings — Tailwind only emits CSS for class names it
// finds verbatim in the source, so these can't be assembled from fragments.
const chip = (tone: 'good' | 'warn' | 'none') =>
  `text-[10px] font-bold px-2 py-0.5 rounded-full ${
    tone === 'good' ? 'bg-success/10 text-success' :
    tone === 'warn' ? 'bg-warning/10 text-warning' :
    'bg-muted text-muted-foreground'
  }`;

const card = 'rounded-2xl p-4 bg-card/75 backdrop-blur-xl border border-border shadow-card';

const CardDetail = () => {
  const { kind: kindParam } = useParams<{ kind: string }>();
  const kind: Kind = kindParam === 'wellbeing' || kindParam === 'meals' ? kindParam : 'medicines';
  const { t, language, activeSeniorId, activeSeniorName, sharedMedicines } = useApp();
  const lang = language as Lang;
  const firstName = activeSeniorName?.split(' ')[0] || activeSeniorName;

  const [range, setRange] = useState<Range>('week');
  const [loading, setLoading] = useState(true);
  const [medLogs, setMedLogs] = useState<db.DBMedicineLog[]>([]);
  const [mealLogs, setMealLogs] = useState<db.DBMealLog[]>([]);
  const [wellLogs, setWellLogs] = useState<db.DBWellbeing[]>([]);
  const days = range === 'week' ? 7 : 30;

  useEffect(() => {
    if (!activeSeniorId) return;
    let cancelled = false;
    setLoading(true);
    const load =
      kind === 'medicines' ? db.getMedicineHistory(activeSeniorId, days).then(r => { if (!cancelled) setMedLogs(r); }) :
      kind === 'meals' ? db.getMealHistory(activeSeniorId, days).then(r => { if (!cancelled) setMealLogs(r); }) :
      db.getWellbeingHistory(activeSeniorId, days).then(r => { if (!cancelled) setWellLogs(r); });
    load.catch(console.error).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeSeniorId, kind, days]);

  const today = isoDay(new Date());
  const pastDays = pastDayKeys(days);

  const meta = {
    medicines: { icon: Pill, title: t('Medicine Adherence', 'दवाई पालन'), tint: 'bg-primary/10 text-primary' },
    wellbeing: { icon: SmilePlus, title: t('Wellbeing', 'स्वास्थ्य'), tint: 'bg-secondary/10 text-secondary' },
    meals: { icon: UtensilsCrossed, title: t('Meals', 'भोजन'), tint: 'bg-warning/10 text-warning' },
  }[kind];
  const Icon = meta.icon;

  // ─── Medicines ───────────────────────────────────────
  const todayMedLogs = medLogs.filter(l => l.taken_date === today);
  const takenToday = sharedMedicines.filter(m => m.taken || todayMedLogs.some(l => l.medicine_id === m.id)).length;
  const medDays = pastDays.map(key => {
    const logs = medLogs.filter(l => l.taken_date === key);
    const expected = sharedMedicines.filter(m => m.startDate <= key && (!m.endDate || m.endDate >= key));
    const missed = expected.filter(m => !logs.some(l => l.medicine_id === m.id));
    return { key, logs, missed, total: Math.max(expected.length, logs.length) };
  });
  const medRangeTaken = medDays.reduce((s, d) => s + d.logs.length, 0) + takenToday;
  const medRangeTotal = medDays.reduce((s, d) => s + d.total, 0) + sharedMedicines.length;
  const medAdherence = medRangeTotal > 0 ? Math.round((medRangeTaken / medRangeTotal) * 100) : null;

  // ─── Wellbeing ───────────────────────────────────────
  const byNewest = (a: db.DBWellbeing, b: db.DBWellbeing) => b.created_at.localeCompare(a.created_at);
  const todayChecks = wellLogs.filter(w => dayOf(w.created_at) === today).sort(byNewest);
  const moodCounts = wellLogs.reduce(
    (acc, w) => ({ ...acc, [w.mood]: acc[w.mood] + 1 }),
    { good: 0, okay: 0, not_well: 0 } as Record<Mood, number>
  );

  // ─── Meals ───────────────────────────────────────────
  const mealsEatenInRange = mealLogs.filter(m => m.eaten).length;

  return (
    <CaregiverLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3 animate-slide-up">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${meta.tint}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-foreground leading-tight">{meta.title}</h2>
            <p className="text-xs text-muted-foreground font-semibold truncate">{firstName}</p>
          </div>
        </div>

        {/* ═══ Today ═══ */}
        <div className={`${card} animate-slide-up-delay-1`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-black text-foreground">{t('Today', 'आज')}</span>
            {kind === 'medicines' && sharedMedicines.length > 0 && (
              <span className={chip(takenToday === sharedMedicines.length ? 'good' : 'warn')}>
                {takenToday}/{sharedMedicines.length} {t('taken', 'ली गई')}
              </span>
            )}
          </div>

          {kind === 'medicines' && (
            sharedMedicines.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">{t('No medicines added yet', 'अभी कोई दवाई नहीं जोड़ी गई')}</p>
            ) : (
              <div>
                {sharedMedicines.map(m => {
                  const log = todayMedLogs.find(l => l.medicine_id === m.id);
                  const taken = m.taken || !!log;
                  return (
                    <div key={m.id} className="flex items-center gap-3 py-2 border-b border-border/60 last:border-0">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${taken ? 'bg-success/10' : 'bg-warning/10'}`}>
                        {taken ? <Check className="w-4 h-4 text-success" /> : <X className="w-4 h-4 text-warning" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{t(m.name, m.nameHi || m.name)}</p>
                        <p className="text-[11px] text-muted-foreground font-semibold truncate">
                          {[m.dosage, m.timing].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span className={`text-[11px] font-bold flex-shrink-0 ${taken ? 'text-success' : 'text-warning'}`}>
                        {taken ? (log ? timeOf(log.taken_at) : t('Taken', 'ली गई')) : t('Not taken yet', 'अभी नहीं ली')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {kind === 'wellbeing' && (
            todayChecks.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">{t('No check-in yet today', 'आज अभी तक कोई चेक-इन नहीं')}</p>
            ) : (
              <div>
                <div className="flex items-center gap-3 py-1">
                  <span className="text-3xl">{moodEmoji[todayChecks[0].mood]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      {t(moodLabel[todayChecks[0].mood][0], moodLabel[todayChecks[0].mood][1])}
                      {todayChecks[0].pain_area && ` — ${todayChecks[0].pain_area}`}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-semibold">
                      {t('Latest check-in', 'नवीनतम चेक-इन')} · {timeOf(todayChecks[0].created_at)}
                    </p>
                  </div>
                </div>
                {todayChecks.length > 1 && (
                  <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                    {todayChecks.slice(1).map(w => (
                      <div key={w.id} className="flex items-center gap-2 text-xs">
                        <span>{moodEmoji[w.mood]}</span>
                        <span className="font-semibold text-foreground flex-1">
                          {t(moodLabel[w.mood][0], moodLabel[w.mood][1])}{w.pain_area && ` — ${w.pain_area}`}
                        </span>
                        <span className="text-muted-foreground">{timeOf(w.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          )}

          {kind === 'meals' && (
            <div>
              {MEAL_TYPES.map(mt => {
                const log = mealLogs.find(l => l.log_date === today && l.meal_type === mt);
                const state: 'eaten' | 'skipped' | 'none' = !log ? 'none' : log.eaten ? 'eaten' : 'skipped';
                return (
                  <div key={mt} className="flex items-center gap-3 py-2 border-b border-border/60 last:border-0">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      state === 'eaten' ? 'bg-success/10' : state === 'skipped' ? 'bg-warning/10' : 'bg-muted'
                    }`}>
                      {state === 'eaten' ? <Check className="w-4 h-4 text-success" /> :
                       state === 'skipped' ? <X className="w-4 h-4 text-warning" /> :
                       <Minus className="w-4 h-4 text-muted-foreground" />}
                    </span>
                    <p className="text-sm font-bold text-foreground flex-1">{t(mealLabel[mt][0], mealLabel[mt][1])}</p>
                    <span className={`text-[11px] font-bold ${
                      state === 'eaten' ? 'text-success' : state === 'skipped' ? 'text-warning' : 'text-muted-foreground'
                    }`}>
                      {state === 'eaten' ? `${t('Eaten', 'खाया')} · ${timeOf(log!.created_at)}` :
                       state === 'skipped' ? t('Skipped', 'छोड़ा') : t('Not logged yet', 'अभी दर्ज नहीं')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══ History ═══ */}
        <div className="flex items-center justify-between animate-slide-up-delay-2">
          <span className="text-sm font-black text-foreground">{t('History', 'इतिहास')}</span>
          <div className="flex gap-1 p-1 rounded-xl bg-muted/50">
            {(['week', 'month'] as Range[]).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  range === r ? 'bg-card shadow-sm text-primary' : 'text-muted-foreground'
                }`}
              >
                {r === 'week' ? t('This Week', 'इस सप्ताह') : t('This Month', 'इस महीने')}
              </button>
            ))}
          </div>
        </div>

        {/* Range summary */}
        <div className={`${card} animate-slide-up-delay-2 flex items-center gap-3`}>
          {kind === 'medicines' && (
            medAdherence === null ? (
              <p className="text-xs text-muted-foreground">{t('No medicines scheduled in this period', 'इस अवधि में कोई दवाई निर्धारित नहीं')}</p>
            ) : (
              <>
                <span className={`text-2xl font-black ${medAdherence >= 80 ? 'text-success' : 'text-warning'}`}>{medAdherence}%</span>
                <p className="text-xs text-muted-foreground font-semibold">
                  {t(`${medRangeTaken} of ${medRangeTotal} taken`, `${medRangeTotal} में से ${medRangeTaken} ली गई`)}
                </p>
              </>
            )
          )}
          {kind === 'wellbeing' && (
            wellLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('No check-ins in this period', 'इस अवधि में कोई चेक-इन नहीं')}</p>
            ) : (
              <div className="flex gap-4 text-xs font-bold">
                <span className="text-success">{moodEmoji.good} {moodCounts.good} {t('good', 'अच्छा')}</span>
                <span className="text-warning">{moodEmoji.okay} {moodCounts.okay} {t('okay', 'ठीक')}</span>
                <span className="text-destructive">{moodEmoji.not_well} {moodCounts.not_well} {t('not well', 'अच्छा नहीं')}</span>
              </div>
            )
          )}
          {kind === 'meals' && (
            mealLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('No meals logged in this period', 'इस अवधि में कोई भोजन दर्ज नहीं')}</p>
            ) : (
              <>
                <span className={`text-2xl font-black ${mealsEatenInRange === mealLogs.length ? 'text-success' : 'text-warning'}`}>
                  {mealsEatenInRange}/{mealLogs.length}
                </span>
                <p className="text-xs text-muted-foreground font-semibold">{t('meals eaten of those logged', 'दर्ज भोजन में से खाए गए')}</p>
              </>
            )
          )}
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">{t('Loading...', 'लोड हो रहा...')}</p>
        ) : (
          <div className="space-y-3">
            {kind === 'medicines' && medDays.map(d => (
              <div key={d.key} className={card}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-black text-foreground">{dayLabel(d.key, lang)}</span>
                  {d.total > 0 ? (
                    <span className={chip(d.missed.length === 0 ? 'good' : 'warn')}>{d.logs.length}/{d.total} {t('taken', 'ली गई')}</span>
                  ) : (
                    <span className={chip('none')}>{t('No medicines scheduled', 'कोई दवाई निर्धारित नहीं')}</span>
                  )}
                </div>
                {d.logs.map(l => (
                  <div key={l.id} className="flex items-center gap-2.5 py-1">
                    <Check className="w-3.5 h-3.5 text-success flex-shrink-0" />
                    <span className="text-xs font-semibold text-foreground flex-1 truncate">{l.medicine_name}</span>
                    <span className="text-[10px] text-muted-foreground">{timeOf(l.taken_at)}</span>
                  </div>
                ))}
                {d.missed.map(m => (
                  <div key={m.id} className="flex items-center gap-2.5 py-1">
                    <X className="w-3.5 h-3.5 text-warning flex-shrink-0" />
                    <span className="text-xs font-semibold text-foreground flex-1 truncate">{t(m.name, m.nameHi || m.name)}</span>
                    <span className="text-[10px] font-bold text-warning">{t('Missed', 'छूटी')}</span>
                  </div>
                ))}
              </div>
            ))}

            {kind === 'wellbeing' && pastDays.map(key => {
              const checks = wellLogs.filter(w => dayOf(w.created_at) === key).sort(byNewest);
              return (
                <div key={key} className={`${card} flex items-center gap-3`}>
                  <span className="text-sm font-black text-foreground w-24 flex-shrink-0">{dayLabel(key, lang)}</span>
                  {checks.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t('No check-in', 'कोई चेक-इन नहीं')}</span>
                  ) : (
                    <>
                      <span className="text-xl">{moodEmoji[checks[0].mood]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">
                          {t(moodLabel[checks[0].mood][0], moodLabel[checks[0].mood][1])}
                          {checks[0].pain_area && ` — ${checks[0].pain_area}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-semibold">
                          {checks.map(w => timeOf(w.created_at)).join(' · ')}
                        </p>
                      </div>
                      {checks.length > 1 && <span className={chip('none')}>×{checks.length}</span>}
                    </>
                  )}
                </div>
              );
            })}

            {kind === 'meals' && pastDays.map(key => {
              const dayLogs = mealLogs.filter(l => l.log_date === key);
              const eaten = dayLogs.filter(l => l.eaten).length;
              return (
                <div key={key} className={`${card} flex items-center gap-3`}>
                  <span className="text-sm font-black text-foreground w-24 flex-shrink-0">{dayLabel(key, lang)}</span>
                  <div className="flex gap-1.5">
                    {MEAL_TYPES.map(mt => {
                      const log = dayLogs.find(l => l.meal_type === mt);
                      return (
                        <span
                          key={mt}
                          title={t(mealLabel[mt][0], mealLabel[mt][1])}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black ${
                            !log ? 'bg-muted text-muted-foreground' :
                            log.eaten ? 'bg-success text-white' :
                            'bg-warning/15 text-warning'
                          }`}
                        >
                          {mealLabel[mt][0][0]}
                        </span>
                      );
                    })}
                  </div>
                  <span className="ml-auto text-xs font-bold text-muted-foreground">
                    {dayLogs.length === 0 ? t('Not logged', 'दर्ज नहीं') : t(`${eaten}/3 eaten`, `3 में से ${eaten} खाए`)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CaregiverLayout>
  );
};

export default CardDetail;
