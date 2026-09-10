import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/react';
import { Heart, Users, Pill, Camera, Upload, PenLine, Loader2, ArrowRight, UserPlus, MessageCircle, Mail } from 'lucide-react';
import CaregiverLayout from '@/components/CaregiverLayout';
import PhoneInput from '@/components/PhoneInput';
import { useApp, SharedMedicine } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';
import MedicationEditor from '@/components/caregiver/MedicationEditor';
import { ExtractedMedication, withScheduleDefaults, blankMedication } from '@/lib/medicineSchedule';
import { extractTextFromImage } from '@/lib/ocr';
import { extractMedicationsWithLLM } from '@/lib/llm';
import { buildWhatsAppShareUrl } from '@/lib/whatsapp';
import { buildMailtoUrl } from '@/lib/email';

type Step = 'about-you' | 'about-them' | 'medications' | 'invite-others';

const RELATIONSHIP_OPTIONS: [string, string][] = [
  ['Father', 'पिता'],
  ['Mother', 'माता'],
  ['Son', 'बेटा'],
  ['Daughter', 'बेटी'],
  ['Spouse', 'जीवनसाथी'],
  ['Sibling', 'भाई-बहन'],
  ['Relative', 'रिश्तेदार'],
  ['Professional Caregiver', 'पेशेवर देखभालकर्ता'],
  ['Other', 'अन्य'],
];

const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const {
    t, currentUserName, caregiverProfile, updateCaregiverProfile,
    linkedSenior, activeSeniorName, patientDetails, updatePatientDetails, updateRelationship,
    setSharedMedicines, completeOnboarding, generateCaregiverInviteCode,
  } = useApp();

  const [step, setStep] = useState<Step>('about-you');
  const [saving, setSaving] = useState(false);

  const inputClass = 'w-full rounded-xl border-2 border-primary/15 bg-card px-4 py-3 text-sm font-semibold text-foreground focus:outline-none focus:border-primary';
  const labelClass = 'text-xs font-bold text-muted-foreground mb-1.5 block';

  // ─── Step 1 — About You ────────────────────────────────
  const [aboutYou, setAboutYou] = useState({
    name: caregiverProfile?.name || currentUserName,
    age: caregiverProfile?.age ?? null as number | null,
    gender: caregiverProfile?.gender ?? null as 'male' | 'female' | 'other' | null,
    phone: caregiverProfile?.phone ?? '',
    email: caregiverProfile?.email || user?.primaryEmailAddress?.emailAddress || '',
  });

  const handleSaveAboutYou = async () => {
    setSaving(true);
    const ok = await updateCaregiverProfile(aboutYou);
    setSaving(false);
    if (ok) {
      setStep('about-them');
    } else {
      toast({ title: t('Could not save — try again', 'सहेज नहीं सके — फिर कोशिश करें'), variant: 'destructive' });
    }
  };

  // ─── Step 2 — About Your Loved One ─────────────────────
  const [relationship, setRelationship] = useState(linkedSenior?.relationship ?? '');
  const [relationshipOther, setRelationshipOther] = useState('');
  const [aboutThem, setAboutThem] = useState({
    name: activeSeniorName || '',
    age: patientDetails?.age ?? null as number | null,
    gender: patientDetails?.gender ?? null as 'male' | 'female' | 'other' | null,
    dateOfBirth: patientDetails?.dateOfBirth ?? '',
    knownConditions: patientDetails?.knownConditions ?? '',
    regularMedication: patientDetails?.regularMedication ?? '',
    habits: patientDetails?.habits ?? '',
  });

  const handleSaveAboutThem = async () => {
    setSaving(true);
    const finalRelationship = relationship === 'Other' ? relationshipOther : relationship;
    const results = await Promise.all([
      updatePatientDetails({
        ...(aboutThem.name ? { name: aboutThem.name } : {}),
        age: aboutThem.age,
        gender: aboutThem.gender,
        dateOfBirth: aboutThem.dateOfBirth || null,
        knownConditions: aboutThem.knownConditions || null,
        regularMedication: aboutThem.regularMedication || null,
        habits: aboutThem.habits || null,
      }),
      finalRelationship ? updateRelationship(finalRelationship) : Promise.resolve(true),
    ]);
    setSaving(false);
    if (results.every(Boolean)) {
      setStep('medications');
    } else {
      toast({ title: t('Could not save — try again', 'सहेज नहीं सके — फिर कोशिश करें'), variant: 'destructive' });
    }
  };

  // ─── Step 3 — Add Medication ────────────────────────────
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [extractedMedications, setExtractedMedications] = useState<ExtractedMedication[]>([]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setUploadedImage(dataUrl);
      setIsScanning(true);
      try {
        const ocrResult = await extractTextFromImage(dataUrl);
        const medications = await extractMedicationsWithLLM(ocrResult.text);
        setExtractedMedications(medications.map((med, i) => withScheduleDefaults(med, String(i + 1))));
      } catch (err) {
        console.error('Error scanning prescription:', err);
        toast({
          title: t("Couldn't read that image", 'वह छवि पढ़ नहीं सके'),
          description: t('Try again, or add the medicine manually below.', 'फिर कोशिश करें, या नीचे दवा खुद जोड़ें।'),
          variant: 'destructive',
        });
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddManually = () => {
    setExtractedMedications(prev => prev.length > 0 ? prev : [blankMedication(String(Date.now()))]);
  };

  const handleFinishMedications = async (saveMeds: boolean) => {
    setSaving(true);
    try {
      if (saveMeds && extractedMedications.length > 0) {
        const sharedMeds: SharedMedicine[] = extractedMedications.map(med => ({
          id: med.id,
          name: med.name,
          nameHi: med.nameHi,
          dosage: med.dosage,
          frequency: med.frequency,
          timing: med.timing,
          beforeAfterFood: med.beforeAfterFood,
          durationType: med.durationType,
          startDate: med.startDate,
          endDate: med.durationType === 'temporary' ? med.endDate : null,
          timesPerDay: med.timesPerDay,
          taken: false,
        }));
        await setSharedMedicines(sharedMeds);
      }
      setStep('invite-others');
    } finally {
      setSaving(false);
    }
  };

  // ─── Step 4 — Invite Other Caregivers ──────────────────
  const [wantsToInvite, setWantsToInvite] = useState<boolean | null>(null);
  const [inviteForm, setInviteForm] = useState({ name: '', age: null as number | null, phone: '', email: '' });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);

  const finishOnboarding = async () => {
    setSaving(true);
    try {
      await completeOnboarding();
      toast({ title: t('All set!', 'सब तैयार है!') });
      navigate('/caregiver', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateInviteLink = async () => {
    setGeneratingInvite(true);
    try {
      const code = await generateCaregiverInviteCode({
        name: inviteForm.name || undefined,
        age: inviteForm.age,
        phone: inviteForm.phone || undefined,
        email: inviteForm.email || undefined,
      });
      if (code) {
        setInviteLink(`${window.location.origin}/?invite=${code}`);
      } else {
        toast({ title: t('Could not create invite — try again', 'आमंत्रण नहीं बना सके — फिर कोशिश करें'), variant: 'destructive' });
      }
    } finally {
      setGeneratingInvite(false);
    }
  };

  const inviteShareMessage = () => {
    const inviteeFirstName = inviteForm.name.split(' ')[0] || inviteForm.name;
    return t(
      `Hi ${inviteeFirstName}, ${currentUserName} added you as a caregiver for ${activeSeniorName} on Kin Care. Download the app and use this link to join: ${inviteLink}`,
      `नमस्ते ${inviteeFirstName}, ${currentUserName} ने आपको Kin Care पर ${activeSeniorName} के लिए देखभालकर्ता के रूप में जोड़ा है। ऐप डाउनलोड करें और जुड़ने के लिए यह लिंक उपयोग करें: ${inviteLink}`
    );
  };

  const handleShareViaWhatsApp = () => {
    if (!inviteLink) return;
    window.open(buildWhatsAppShareUrl(inviteForm.phone, inviteShareMessage()), '_blank');
    finishOnboarding();
  };

  const handleShareViaEmail = () => {
    if (!inviteLink) return;
    const subject = t(`Join ${activeSeniorName} on Kin Care`, `Kin Care पर ${activeSeniorName} से जुड़ें`);
    window.open(buildMailtoUrl(inviteForm.email, subject, inviteShareMessage()), '_blank');
    finishOnboarding();
  };

  const handleSkip = () => navigate('/caregiver', { replace: true });

  const stepNumber = step === 'about-you' ? 1 : step === 'about-them' ? 2 : step === 'medications' ? 3 : 4;

  return (
    <CaregiverLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-muted-foreground">{t(`Step ${stepNumber} of 4`, `चरण ${stepNumber} / 4`)}</span>
          <button type="button" onClick={handleSkip} className="text-xs font-bold text-muted-foreground underline">
            {t('Skip for now', 'अभी के लिए छोड़ें')}
          </button>
        </div>

        {step === 'about-you' && (
          <div className="space-y-4 animate-slide-up">
            <div className="glass-card rounded-2xl p-5 flex items-start gap-3">
              <div className="stat-icon-bg bg-primary/10 flex-shrink-0">
                <Heart className="w-5 h-5 text-primary" />
              </div>
              <p className="font-bold text-foreground leading-snug">
                {t('Now we know that you care, wish to tell us more.', 'अब हम जानते हैं कि आप परवाह करते हैं, हमें और बताना चाहेंगे?')}
              </p>
            </div>

            <div>
              <label className={labelClass}>{t('Your Name', 'आपका नाम')}</label>
              <input type="text" value={aboutYou.name} onChange={(e) => setAboutYou(p => ({ ...p, name: e.target.value }))} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('Age', 'उम्र')}</label>
                <input
                  type="number"
                  value={aboutYou.age ?? ''}
                  onChange={(e) => setAboutYou(p => ({ ...p, age: e.target.value ? Number(e.target.value) : null }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t('Gender', 'लिंग')}</label>
                <select
                  value={aboutYou.gender ?? ''}
                  onChange={(e) => setAboutYou(p => ({ ...p, gender: (e.target.value || null) as typeof p.gender }))}
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
              <label className={labelClass}>{t('Mobile Number', 'मोबाइल नंबर')}</label>
              <PhoneInput value={aboutYou.phone} onChange={(v) => setAboutYou(p => ({ ...p, phone: v ?? '' }))} />
            </div>
            <div>
              <label className={labelClass}>{t('Email ID', 'ईमेल आईडी')}</label>
              <input type="email" value={aboutYou.email ?? ''} onChange={(e) => setAboutYou(p => ({ ...p, email: e.target.value }))} className={inputClass} />
            </div>

            <button
              type="button"
              onClick={handleSaveAboutYou}
              disabled={saving}
              className="w-full elder-tile gradient-primary text-primary-foreground text-elder-lg py-4 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving ? t('Saving...', 'सहेजा जा रहा है...') : t('Next', 'आगे')}
              {!saving && <ArrowRight className="w-5 h-5" />}
            </button>
          </div>
        )}

        {step === 'about-them' && (
          <div className="space-y-4 animate-slide-up">
            <div className="glass-card rounded-2xl p-5 flex items-start gap-3">
              <div className="stat-icon-bg bg-primary/10 flex-shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <p className="font-bold text-foreground leading-snug">
                {t('Tell us about your loved one', 'अपने प्रियजन के बारे में बताएं')}
              </p>
            </div>

            <div>
              <label className={labelClass}>{t('Relationship', 'रिश्ता')}</label>
              <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className={inputClass}>
                <option value="">{t('Select', 'चुनें')}</option>
                {RELATIONSHIP_OPTIONS.map(([en, hi]) => <option key={en} value={en}>{t(en, hi)}</option>)}
              </select>
              {relationship === 'Other' && (
                <input
                  type="text"
                  placeholder={t('Please specify', 'कृपया बताएं')}
                  value={relationshipOther}
                  onChange={(e) => setRelationshipOther(e.target.value)}
                  className={`${inputClass} mt-2`}
                />
              )}
            </div>
            <div>
              <label className={labelClass}>{t('Their Name', 'उनका नाम')}</label>
              <input type="text" value={aboutThem.name} onChange={(e) => setAboutThem(p => ({ ...p, name: e.target.value }))} className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('Age', 'उम्र')}</label>
                <input
                  type="number"
                  value={aboutThem.age ?? ''}
                  onChange={(e) => setAboutThem(p => ({ ...p, age: e.target.value ? Number(e.target.value) : null }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>{t('Gender', 'लिंग')}</label>
                <select
                  value={aboutThem.gender ?? ''}
                  onChange={(e) => setAboutThem(p => ({ ...p, gender: (e.target.value || null) as typeof p.gender }))}
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
              <input type="date" value={aboutThem.dateOfBirth} onChange={(e) => setAboutThem(p => ({ ...p, dateOfBirth: e.target.value }))} className={inputClass} />
              <p className="text-[11px] text-muted-foreground font-semibold mt-1">
                {t("Optional — share their special day and we'll help wish them Happy Birthday.", 'वैकल्पिक — उनका खास दिन बताएं और हम जन्मदिन की शुभकामनाएं देने में मदद करेंगे।')}
              </p>
            </div>
            <div>
              <label className={labelClass}>{t('Any Existing Medical Condition', 'कोई मौजूदा बीमारी')}</label>
              <textarea rows={2} value={aboutThem.knownConditions} onChange={(e) => setAboutThem(p => ({ ...p, knownConditions: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t('Any Regular Medication', 'कोई नियमित दवा')}</label>
              <textarea rows={2} value={aboutThem.regularMedication} onChange={(e) => setAboutThem(p => ({ ...p, regularMedication: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t('Any Habits (sugar, spices, smoking, drinking, etc.)', 'कोई आदतें (मीठा, मसाले, धूम्रपान, शराब, आदि)')}</label>
              <textarea rows={2} value={aboutThem.habits} onChange={(e) => setAboutThem(p => ({ ...p, habits: e.target.value }))} className={inputClass} />
            </div>

            <button
              type="button"
              onClick={handleSaveAboutThem}
              disabled={saving}
              className="w-full elder-tile gradient-primary text-primary-foreground text-elder-lg py-4 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving ? t('Saving...', 'सहेजा जा रहा है...') : t('Next', 'आगे')}
              {!saving && <ArrowRight className="w-5 h-5" />}
            </button>
          </div>
        )}

        {step === 'medications' && (
          <div className="space-y-4 animate-slide-up">
            <div className="glass-card rounded-2xl p-5 flex items-start gap-3">
              <div className="stat-icon-bg bg-primary/10 flex-shrink-0">
                <Pill className="w-5 h-5 text-primary" />
              </div>
              <p className="font-bold text-foreground leading-snug">
                {t('Add their medication', 'उनकी दवा जोड़ें')}
              </p>
            </div>

            {extractedMedications.length === 0 && (
              <div className="glass-card rounded-2xl p-6 border-2 border-dashed border-primary/30 flex flex-col items-center text-center gap-4">
                <p className="text-muted-foreground font-semibold">
                  {t('Scan a prescription, or are you a pro typer?', 'प्रिस्क्रिप्शन स्कैन करें, या क्या आप खुद टाइप करना पसंद करेंगे?')}
                </p>
                <div className="flex gap-3 flex-wrap justify-center">
                  <label className="px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-bold flex items-center gap-2 cursor-pointer">
                    <Camera className="w-4 h-4" />
                    {t('Scan Prescription', 'प्रिस्क्रिप्शन स्कैन करें')}
                    <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" aria-label="Scan prescription image" />
                  </label>
                  <label className="px-4 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-bold flex items-center gap-2 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    {t('Upload Image', 'छवि अपलोड करें')}
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" aria-label="Upload prescription image" />
                  </label>
                </div>
                <button type="button" onClick={handleAddManually} className="text-sm font-bold text-primary flex items-center gap-2">
                  <PenLine className="w-4 h-4" />
                  {t("I'm a pro typer — add manually", 'मैं टाइप करना पसंद करूंगा — खुद जोड़ें')}
                </button>
                {isScanning && (
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('Scanning prescription...', 'प्रिस्क्रिप्शन स्कैन हो रहा है...')}
                  </div>
                )}
              </div>
            )}

            {extractedMedications.length > 0 && (
              <MedicationEditor medications={extractedMedications} setMedications={setExtractedMedications} />
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleFinishMedications(false)}
                disabled={saving}
                className="flex-1 py-3 rounded-xl border border-border text-muted-foreground font-bold text-sm disabled:opacity-60"
              >
                {t("I'll add medicines later", 'मैं बाद में दवाइयाँ जोड़ूंगा')}
              </button>
              {extractedMedications.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleFinishMedications(true)}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm disabled:opacity-60"
                >
                  {saving ? t('Saving...', 'सहेजा जा रहा है...') : t('Save & Continue', 'सहेजें और आगे बढ़ें')}
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'invite-others' && (
          <div className="space-y-4 animate-slide-up">
            <div className="glass-card rounded-2xl p-5 flex items-start gap-3">
              <div className="stat-icon-bg bg-primary/10 flex-shrink-0">
                <UserPlus className="w-5 h-5 text-primary" />
              </div>
              <p className="font-bold text-foreground leading-snug">
                {t('Do you wish to add other caretakers?', 'क्या आप अन्य देखभालकर्ता जोड़ना चाहेंगे?')}
              </p>
            </div>

            {wantsToInvite === null && (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setWantsToInvite(false); finishOnboarding(); }}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl border border-border text-muted-foreground font-bold text-sm disabled:opacity-60"
                >
                  {t('No', 'नहीं')}
                </button>
                <button
                  type="button"
                  onClick={() => setWantsToInvite(true)}
                  className="flex-1 py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm"
                >
                  {t('Yes', 'हाँ')}
                </button>
              </div>
            )}

            {wantsToInvite && !inviteLink && (
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>{t('Their Name', 'उनका नाम')}</label>
                  <input type="text" value={inviteForm.name} onChange={(e) => setInviteForm(p => ({ ...p, name: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t('Age', 'उम्र')}</label>
                  <input
                    type="number"
                    value={inviteForm.age ?? ''}
                    onChange={(e) => setInviteForm(p => ({ ...p, age: e.target.value ? Number(e.target.value) : null }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t('Mobile Number', 'मोबाइल नंबर')}</label>
                  <PhoneInput value={inviteForm.phone} onChange={(v) => setInviteForm(p => ({ ...p, phone: v ?? '' }))} />
                </div>
                <div>
                  <label className={labelClass}>{t('Email ID', 'ईमेल आईडी')}</label>
                  <input
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm(p => ({ ...p, email: e.target.value }))}
                    className={inputClass}
                  />
                  <p className="text-[11px] text-muted-foreground font-semibold mt-1">
                    {t('So they can join as a secondary or tertiary caregiver from the link.', 'ताकि वे लिंक से द्वितीयक या तृतीयक देखभालकर्ता के रूप में जुड़ सकें।')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateInviteLink}
                  disabled={!inviteForm.name || (!inviteForm.phone && !inviteForm.email) || generatingInvite}
                  className="w-full elder-tile gradient-primary text-primary-foreground text-elder-lg py-4 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {generatingInvite ? t('Creating link...', 'लिंक बनाया जा रहा है...') : t('Continue', 'आगे')}
                  {!generatingInvite && <ArrowRight className="w-5 h-5" />}
                </button>
              </div>
            )}

            {inviteLink && (
              <div className="space-y-4">
                <div className="glass-card rounded-2xl p-5">
                  <p className="font-bold text-foreground leading-snug">
                    {t('Do you wish to share the joy of caring by sharing the app link for them to download Kin Care?', 'क्या आप देखभाल की खुशी बांटना चाहेंगे — उन्हें Kin Care डाउनलोड करने के लिए ऐप लिंक भेजें?')}
                  </p>
                </div>
                <div className="flex gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={finishOnboarding}
                    disabled={saving}
                    className="flex-1 py-3 rounded-xl border border-border text-muted-foreground font-bold text-sm disabled:opacity-60"
                  >
                    {t('No, skip', 'नहीं, छोड़ें')}
                  </button>
                  {inviteForm.phone && (
                    <button
                      type="button"
                      onClick={handleShareViaWhatsApp}
                      disabled={saving}
                      className="flex-1 py-3 rounded-xl gradient-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {t('WhatsApp', 'WhatsApp')}
                    </button>
                  )}
                  {inviteForm.email && (
                    <button
                      type="button"
                      onClick={handleShareViaEmail}
                      disabled={saving}
                      className="flex-1 py-3 rounded-xl border-2 border-primary/30 text-primary font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <Mail className="w-4 h-4" />
                      {t('Email', 'ईमेल')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </CaregiverLayout>
  );
};

export default Onboarding;
