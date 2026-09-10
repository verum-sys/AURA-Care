import { Pill, Clock, Utensils, Trash2, Plus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExtractedMedication, blankMedication } from '@/lib/medicineSchedule';

interface MedicationEditorProps {
  medications: ExtractedMedication[];
  setMedications: (meds: ExtractedMedication[] | ((prev: ExtractedMedication[]) => ExtractedMedication[])) => void;
}

const FOOD_OPTIONS: Array<'before' | 'after' | 'with' | 'any'> = ['before', 'after', 'with', 'any'];

/**
 * Fully-editable list of medication cards — shared by the standalone
 * Prescription Scan page (scanned or manually-added rows) and the
 * onboarding wizard's "Add Medication" step, so the edit UI only exists once.
 */
const MedicationEditor = ({ medications, setMedications }: MedicationEditorProps) => {
  const { t } = useApp();

  const update = <K extends keyof ExtractedMedication>(id: string, key: K, value: ExtractedMedication[K]) => {
    setMedications(prev => prev.map(m => m.id === id ? { ...m, [key]: value } : m));
  };

  const remove = (id: string) => {
    setMedications(prev => prev.filter(m => m.id !== id));
  };

  const addBlank = () => {
    setMedications(prev => [...prev, blankMedication(String(Date.now()))]);
  };

  const foodLabel = (type: 'before' | 'after' | 'with' | 'any') => {
    switch (type) {
      case 'before': return t('Before Food', 'भोजन से पहले');
      case 'after': return t('After Food', 'भोजन के बाद');
      case 'with': return t('With Food', 'भोजन के साथ');
      case 'any': return t('Any Time', 'कोई भी समय');
    }
  };

  return (
    <div className="space-y-4">
      {medications.map((med, index) => (
        <Card key={med.id} className="p-4 animate-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
          <div className="flex items-start justify-between mb-3 gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Pill className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <input
                  type="text"
                  placeholder={t('Medicine name', 'दवा का नाम')}
                  value={med.name}
                  onChange={(e) => update(med.id, 'name', e.target.value)}
                  className="w-full font-bold text-foreground text-sm bg-transparent border-b border-border focus:outline-none focus:border-primary px-0 py-0.5"
                />
                <input
                  type="text"
                  placeholder={t('Name in Hindi (optional)', 'हिंदी में नाम (वैकल्पिक)')}
                  value={med.nameHi}
                  onChange={(e) => update(med.id, 'nameHi', e.target.value)}
                  className="w-full text-xs text-muted-foreground bg-transparent border-b border-transparent focus:outline-none focus:border-primary px-0 py-0.5"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove(med.id)}
              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex-shrink-0"
              aria-label={t('Remove medicine', 'दवा हटाएं')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Pill className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                placeholder={t('Dosage', 'खुराक')}
                value={med.dosage}
                onChange={(e) => update(med.id, 'dosage', e.target.value)}
                className="w-full font-semibold text-foreground bg-transparent border-b border-border focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                placeholder={t('Times, e.g. 08:00, 20:00', 'समय, जैसे 08:00, 20:00')}
                value={med.timing}
                onChange={(e) => update(med.id, 'timing', e.target.value)}
                className="w-full font-semibold text-foreground bg-transparent border-b border-border focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex items-center gap-2 col-span-2">
              <Utensils className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">{t('Instructions:', 'निर्देश:')}</span>
              <div className="flex gap-1.5 flex-wrap">
                {FOOD_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => update(med.id, 'beforeAfterFood', opt)}
                    className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                      med.beforeAfterFood === opt ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {foodLabel(opt)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Duration + reminder-frequency controls */}
          <div className="mt-3 pt-3 border-t border-border space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-semibold flex-1">{t('Duration', 'अवधि')}</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => update(med.id, 'durationType', 'permanent')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    med.durationType === 'permanent' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {t('Permanent', 'स्थायी')}
                </button>
                <button
                  type="button"
                  onClick={() => update(med.id, 'durationType', 'temporary')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    med.durationType === 'temporary' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {t('Temporary', 'अस्थायी')}
                </button>
              </div>
            </div>

            {med.durationType === 'temporary' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold block mb-1">{t('Start', 'शुरू')}</label>
                  <input
                    type="date"
                    value={med.startDate}
                    onChange={(e) => update(med.id, 'startDate', e.target.value)}
                    className="w-full text-xs font-semibold rounded-lg border border-border px-2 py-1.5 bg-background"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold block mb-1">{t('End', 'अंत')}</label>
                  <input
                    type="date"
                    value={med.endDate ?? ''}
                    onChange={(e) => update(med.id, 'endDate', e.target.value || null)}
                    className="w-full text-xs font-semibold rounded-lg border border-border px-2 py-1.5 bg-background"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-semibold flex-1">{t('Times per day (for reminders)', 'दिन में कितनी बार (याद के लिए)')}</span>
              <select
                value={med.timesPerDay}
                onChange={(e) => update(med.id, 'timesPerDay', Number(e.target.value))}
                className="text-xs font-bold rounded-lg border border-border px-2 py-1.5 bg-background"
              >
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </Card>
      ))}

      <Button type="button" onClick={addBlank} variant="outline" className="w-full gap-2">
        <Plus className="w-4 h-4" />
        {t('Add another medicine', 'एक और दवा जोड़ें')}
      </Button>
    </div>
  );
};

export default MedicationEditor;
