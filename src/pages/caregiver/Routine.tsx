import { useState, useEffect } from 'react';
import { Clock, Sunrise, Coffee, Sun, Moon, Bed, Lock, Save } from 'lucide-react';
import CaregiverLayout from '@/components/CaregiverLayout';
import { useApp, SeniorRoutine } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';

const DEFAULT_ROUTINE: SeniorRoutine = {
  wakeTime: '07:00',
  breakfastTime: '08:00',
  lunchTime: '13:00',
  dinnerTime: '20:00',
  sleepTime: '22:00',
};

const FIELDS: { key: keyof SeniorRoutine; icon: typeof Clock; labelEn: string; labelHi: string }[] = [
  { key: 'wakeTime', icon: Sunrise, labelEn: 'Wake Up', labelHi: 'जागना' },
  { key: 'breakfastTime', icon: Coffee, labelEn: 'Breakfast', labelHi: 'नाश्ता' },
  { key: 'lunchTime', icon: Sun, labelEn: 'Lunch', labelHi: 'दोपहर का खाना' },
  { key: 'dinnerTime', icon: Moon, labelEn: 'Dinner', labelHi: 'रात का खाना' },
  { key: 'sleepTime', icon: Bed, labelEn: 'Sleep', labelHi: 'सोना' },
];

// Caregiver-set daily routine. Drives reminder scheduling: medicine and meal
// check-ins are bundled onto these anchors rather than fixed generic slots,
// so reminders stay tied to how the senior's day actually runs.
const Routine = () => {
  const { t, seniorRoutine, updateRoutine, isPrimaryCaregiver, linkedSenior } = useApp();
  const [form, setForm] = useState<SeniorRoutine>(seniorRoutine ?? DEFAULT_ROUTINE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (seniorRoutine) setForm(seniorRoutine);
  }, [seniorRoutine]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await updateRoutine(form);
      toast(ok
        ? { title: t('Routine saved', 'दिनचर्या सहेजी गई') }
        : { title: t('Could not save routine', 'दिनचर्या सहेज नहीं सके'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const readOnly = !isPrimaryCaregiver;

  return (
    <CaregiverLayout title={t('Daily Routine', 'दैनिक दिनचर्या')}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground font-semibold">
          {t(
            `Set ${linkedSenior?.seniorName || 'their'} daily schedule — reminders for medicines and meals are timed around these.`,
            `${linkedSenior?.seniorName || 'उनकी'} दैनिक दिनचर्या सेट करें — दवाई और भोजन की याद इन्हीं समयों के आसपास दी जाएगी।`
          )}
        </p>

        {readOnly && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-muted/60 border border-border">
            <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <p className="text-xs font-semibold text-muted-foreground">
              {t('Only the primary caregiver can edit the routine.', 'केवल मुख्य देखभालकर्ता ही दिनचर्या बदल सकते हैं।')}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {FIELDS.map(({ key, icon: Icon, labelEn, labelHi }) => (
            <div key={key} className="glass-card rounded-2xl p-4 flex items-center gap-4">
              <div className="stat-icon-bg bg-primary/10 flex-shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">{t(labelEn, labelHi)}</p>
              </div>
              <input
                type="time"
                value={form[key]}
                disabled={readOnly}
                onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                className="text-lg font-black text-primary bg-transparent border-2 border-primary/20 rounded-xl px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-primary"
              />
            </div>
          ))}
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full elder-tile gradient-primary text-primary-foreground text-elder-lg py-4 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Save className="w-5 h-5" />
            {saving ? t('Saving...', 'सहेजा जा रहा है...') : t('Save Routine', 'दिनचर्या सहेजें')}
          </button>
        )}
      </div>
    </CaregiverLayout>
  );
};

export default Routine;
