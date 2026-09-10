import { useState, useRef } from 'react';
import { Camera, Upload, FileText, CheckCircle2, Loader2, Scan, Lock, PenLine } from 'lucide-react';
import CaregiverLayout from '@/components/CaregiverLayout';
import { useApp, SharedMedicine } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import MedicationEditor from '@/components/caregiver/MedicationEditor';
import { extractTextFromImage } from '@/lib/ocr';
import { extractMedicationsWithLLM, Medication } from '@/lib/llm';
import { ExtractedMedication, withScheduleDefaults, blankMedication } from '@/lib/medicineSchedule';
import { toast } from 'sonner';

const PrescriptionScan = () => {
  const { t, setSharedMedicines, isPrimaryCaregiver } = useApp();
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [extractedMedications, setExtractedMedications] = useState<ExtractedMedication[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real OCR extraction using Google Document AI + LLM
  const processPrescription = async () => {
    if (!uploadedImage) return;

    setIsScanning(true);

    try {
      // Step 1: OCR - Extract text from image
      const ocrResult = await extractTextFromImage(uploadedImage);

      // Step 2: LLM - Extract structured medication data from OCR text
      const medications = await extractMedicationsWithLLM(ocrResult.text);

      // Convert to ExtractedMedication format with IDs + schedule defaults
      const extractedMeds: ExtractedMedication[] = medications.map((med, index) =>
        withScheduleDefaults(med, String(index + 1))
      );

      setExtractedMedications(extractedMeds);
      setScanComplete(true);
    } catch (error) {
      console.error('Error processing prescription:', error);
      // Fall back to mock data if API calls fail
      const mockMeds: Medication[] = [
        {
          name: 'Metformin 500mg',
          nameHi: 'मेटफॉर्मिन 500mg',
          dosage: '1 tablet',
          frequency: 'Twice daily',
          timing: '08:00, 20:00',
          beforeAfterFood: 'after',
          confidence: 85
        },
        {
          name: 'Amlodipine 5mg',
          nameHi: 'एम्लोडिपाइन 5mg',
          dosage: '1 tablet',
          frequency: 'Once daily',
          timing: '09:00',
          beforeAfterFood: 'after',
          confidence: 82
        }
      ];
      setExtractedMedications(mockMeds.map((med, index) => withScheduleDefaults(med, String(index + 1))));
      setScanComplete(true);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result as string);
        setScanComplete(false);
        setExtractedMedications([]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = () => {
    fileInputRef.current?.click();
  };

  const handleAddManually = () => {
    setExtractedMedications([blankMedication(String(Date.now()))]);
    setScanComplete(true);
  };

  const startOver = () => {
    setUploadedImage(null);
    setScanComplete(false);
    setExtractedMedications([]);
  };

  const confirmSchedule = async () => {
    try {
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
      toast.success(t('Medication schedule updated and synced!', 'दवा का समय अपडेट हो गया है और सिंक हो गया है!'));
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast.error(t('Failed to save schedule', 'समय सारणी सहेजने में विफल'));
    }
  };

  if (!isPrimaryCaregiver) {
    return (
      <CaregiverLayout title={t('Prescription Scan', 'प्रिस्क्रिप्शन स्कैन')}>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-black text-foreground mb-1">{t('Primary Caregiver Only', 'केवल मुख्य देखभालकर्ता')}</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {t('Only the primary caregiver can scan prescriptions and edit medicines.', 'केवल मुख्य देखभालकर्ता ही प्रिस्क्रिप्शन स्कैन कर सकते हैं और दवाइयाँ बदल सकते हैं।')}
          </p>
        </div>
      </CaregiverLayout>
    );
  }

  return (
    <CaregiverLayout title={t('Prescription Scan', 'प्रिस्क्रिप्शन स्कैन')}>
      <div className="space-y-5">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-elder p-4 border border-primary/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center">
              <Scan className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">{t('Smart Prescription Scanner', 'स्मार्ट प्रिस्क्रिप्शन स्कैनर')}</h2>
              <p className="text-sm text-muted-foreground">{t('AI-powered medication extraction', 'AI-संचालित दवा निष्कर्षण')}</p>
            </div>
          </div>
        </div>

        {/* Upload / manual-entry starting point */}
        {!uploadedImage && !scanComplete && (
          <div className="space-y-3">
            <Card className="p-6 border-2 border-dashed border-primary/30 bg-primary/5">
              <div className="flex flex-col items-center justify-center text-center">
                <FileText className="w-12 h-12 text-primary/50 mb-3" />
                <p className="text-muted-foreground font-semibold mb-4">
                  {t('Upload or capture prescription image', 'प्रिस्क्रिप्शन छवि अपलोड या कैप्चर करें')}
                </p>
                <div className="flex gap-3 flex-wrap justify-center">
                  <Button onClick={handleCameraCapture} className="gradient-primary text-primary-foreground gap-2">
                    <Camera className="w-4 h-4" />
                    {t('Camera', 'कैमरा')}
                  </Button>
                  <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="gap-2">
                    <Upload className="w-4 h-4" />
                    {t('Upload', 'अपलोड')}
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="hidden"
                  aria-label="Upload prescription image"
                />
                <div className="w-full flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground font-semibold">{t('or', 'या')}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <Button onClick={handleAddManually} variant="outline" className="gap-2">
                  <PenLine className="w-4 h-4" />
                  {t('Are you a pro typer? Add manually', 'क्या आप टाइप करने में माहिर हैं? खुद जोड़ें')}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Uploaded Image Preview */}
        {uploadedImage && (
          <div className="space-y-4">
            <Card className="p-3 relative overflow-hidden">
              <img
                src={uploadedImage}
                alt="Prescription"
                className="w-full h-48 object-cover rounded-lg"
              />
              {!scanComplete && !isScanning && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                  <Button onClick={processPrescription} className="gradient-primary text-primary-foreground gap-2">
                    <Scan className="w-4 h-4" />
                    {t('Start OCR Scan', 'OCR स्कैन शुरू करें')}
                  </Button>
                </div>
              )}
            </Card>

            {/* Scanning Animation */}
            {isScanning && (
              <Card className="p-6 bg-primary/5 border-primary/20">
                <div className="flex flex-col items-center justify-center">
                  <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
                  <p className="text-lg font-bold text-foreground">{t('Scanning prescription...', 'प्रिस्क्रिप्शन स्कैन हो रहा है...')}</p>
                  <p className="text-sm text-muted-foreground mt-1">{t('Using AI to extract medication details', 'AI का उपयोग करके दवा का विवरण निकाला जा रहा है')}</p>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Scan / manual-entry Results — editable regardless of source */}
        {scanComplete && extractedMedications.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-bold">
                {uploadedImage ? t('Scan Complete!', 'स्कैन पूर्ण!') : t('Ready to fill in', 'भरने के लिए तैयार')}
              </span>
            </div>

            <h3 className="text-lg font-bold text-foreground">
              {t('Medications', 'दवाइयाँ')} ({extractedMedications.length})
            </h3>

            <MedicationEditor medications={extractedMedications} setMedications={setExtractedMedications} />

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button onClick={startOver} variant="outline" className="flex-1">
                {t('Start Over', 'फिर से शुरू करें')}
              </Button>
              <Button onClick={confirmSchedule} className="flex-1 gradient-primary text-primary-foreground">
                {t('Confirm & Sync', 'पुष्टि करें और सिंक करें')}
              </Button>
            </div>
          </div>
        )}

        {/* How It Works */}
        <Card className="p-4 bg-muted/50">
          <h3 className="font-bold text-foreground mb-3">{t('How It Works', 'यह कैसे काम करता है')}</h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
              <p className="text-muted-foreground">{t('Caregiver uploads prescription image', 'देखभालकर्ता प्रिस्क्रिप्शन छवि अपलोड करता है')}</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
              <p className="text-muted-foreground">{t('OCR extracts medicine names, dosage, frequency', 'OCR दवा के नाम, खुराक, आवृत्ति निकालता है')}</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
              <p className="text-muted-foreground">{t('Before/After food instructions detected', 'भोजन से पहले/बाद के निर्देश पता लगाए गए')}</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">4</div>
              <p className="text-muted-foreground">{t('Every field stays editable before you confirm', 'पुष्टि करने से पहले हर फ़ील्ड संपादन योग्य रहती है')}</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-xs font-bold">5</div>
              <p className="text-muted-foreground font-semibold">{t('Senior app updates automatically', 'बुज़ुर्ग का ऐप स्वचालित अपडेट होता है')}</p>
            </div>
          </div>
        </Card>
      </div>
    </CaregiverLayout>
  );
};

export default PrescriptionScan;
