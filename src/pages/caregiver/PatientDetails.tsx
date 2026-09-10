import { useState, useEffect } from 'react';
import { Lock, Save, User } from 'lucide-react';
import CaregiverLayout from '@/components/CaregiverLayout';
import PhoneInput from '@/components/PhoneInput';
import { useApp, PatientDetails as PatientDetailsType } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';

const EMPTY: PatientDetailsType = {
  phone: null,
  dateOfBirth: null,
  gender: null,
  bloodGroup: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  knownConditions: null,
  allergies: null,
  notes: null,
  age: null,
  regularMedication: null,
  habits: null,
};

const PatientDetails = () => {
  const { t, patientDetails, updatePatientDetails, isPrimaryCaregiver, activeSeniorName } = useApp();
  const [form, setForm] = useState<PatientDetailsType>(patientDetails ?? EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (patientDetails) setForm(patientDetails);
  }, [patientDetails]);

  const readOnly = !isPrimaryCaregiver;

  const set = <K extends keyof PatientDetailsType>(key: K, value: PatientDetailsType[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await updatePatientDetails(form);
      toast(ok
        ? { title: t('Dependant details saved', 'आश्रित विवरण सहेजा गया') }
        : { title: t('Could not save dependant details', 'आश्रित विवरण सहेज नहीं सके'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full rounded-xl border-2 border-primary/15 bg-card px-4 py-3 text-sm font-semibold text-foreground focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed';
  const labelClass = 'text-xs font-bold text-muted-foreground mb-1.5 block';

  return (
    <CaregiverLayout title={t('Dependant Profile', 'आश्रित प्रोफ़ाइल')}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 glass-card rounded-2xl p-4">
          <div className="stat-icon-bg bg-primary/10">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold">{t('About', 'के बारे में')}</p>
            <p className="font-black text-foreground">{activeSeniorName || t('Your loved one', 'आपका अपना')}</p>
          </div>
        </div>

        {readOnly && (
          <div className="flex items-center gap-2 p-3 rounded-2xl bg-muted/60 border border-border">
            <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <p className="text-xs font-semibold text-muted-foreground">
              {t('Only the primary caregiver can edit dependant details.', 'केवल मुख्य देखभालकर्ता ही आश्रित विवरण बदल सकते हैं।')}
            </p>
          </div>
        )}

        <div>
          <label className={labelClass}>{t("Their Phone Number", 'उनका फ़ोन नंबर')}</label>
          <PhoneInput disabled={readOnly} value={form.phone} onChange={(v) => set('phone', v)} />
          <p className="text-[11px] text-muted-foreground font-semibold mt-1">
            {t("Used by the \"wish to speak?\" call button on Home.", 'होम पर "बात करना है?" कॉल बटन के लिए उपयोग होता है।')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{t('Age', 'उम्र')}</label>
            <input
              type="number"
              disabled={readOnly}
              value={form.age ?? ''}
              onChange={(e) => set('age', e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('Gender', 'लिंग')}</label>
            <select
              disabled={readOnly}
              value={form.gender ?? ''}
              onChange={(e) => set('gender', (e.target.value || null) as PatientDetailsType['gender'])}
              className={inputClass}
            >
              <option value="">{t('Select', 'चुनें')}</option>
              <option value="male">{t('Male', 'पुरुष')}</option>
              <option value="female">{t('Female', 'महिला')}</option>
              <option value="other">{t('Other', 'अन्य')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>{t('Date of Birth', 'जन्म तिथि')}</label>
          <input
            type="date"
            disabled={readOnly}
            value={form.dateOfBirth ?? ''}
            onChange={(e) => set('dateOfBirth', e.target.value || null)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>{t('Blood Group', 'ब्लड ग्रुप')}</label>
          <input
            type="text"
            disabled={readOnly}
            placeholder="B+"
            value={form.bloodGroup ?? ''}
            onChange={(e) => set('bloodGroup', e.target.value || null)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{t('Emergency Contact Name', 'आपातकालीन संपर्क नाम')}</label>
            <input
              type="text"
              disabled={readOnly}
              value={form.emergencyContactName ?? ''}
              onChange={(e) => set('emergencyContactName', e.target.value || null)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>{t('Emergency Contact Phone', 'आपातकालीन संपर्क फ़ोन')}</label>
            <PhoneInput disabled={readOnly} value={form.emergencyContactPhone} onChange={(v) => set('emergencyContactPhone', v)} />
          </div>
        </div>

        <div>
          <label className={labelClass}>{t('Known Conditions', 'ज्ञात बीमारियाँ')}</label>
          <textarea
            disabled={readOnly}
            rows={2}
            value={form.knownConditions ?? ''}
            onChange={(e) => set('knownConditions', e.target.value || null)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>{t('Regular Medication', 'नियमित दवा')}</label>
          <textarea
            disabled={readOnly}
            rows={2}
            value={form.regularMedication ?? ''}
            onChange={(e) => set('regularMedication', e.target.value || null)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>{t('Habits (sugar, spices, smoking, drinking, etc.)', 'आदतें (मीठा, मसाले, धूम्रपान, शराब, आदि)')}</label>
          <textarea
            disabled={readOnly}
            rows={2}
            value={form.habits ?? ''}
            onChange={(e) => set('habits', e.target.value || null)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>{t('Allergies', 'एलर्जी')}</label>
          <textarea
            disabled={readOnly}
            rows={2}
            value={form.allergies ?? ''}
            onChange={(e) => set('allergies', e.target.value || null)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>{t('Notes', 'टिप्पणियाँ')}</label>
          <textarea
            disabled={readOnly}
            rows={3}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
            className={inputClass}
          />
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full elder-tile gradient-primary text-primary-foreground text-elder-lg py-4 flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Save className="w-5 h-5" />
            {saving ? t('Saving...', 'सहेजा जा रहा है...') : t('Save Details', 'विवरण सहेजें')}
          </button>
        )}
      </div>
    </CaregiverLayout>
  );
};

export default PatientDetails;
