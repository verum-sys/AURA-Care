import { useState, useEffect, useCallback, useRef } from 'react';
import { Mic, MicOff, X, Loader2, Volume2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';
import * as db from '@/lib/database';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { processVoiceCommand, AgentAction } from '@/lib/voiceAgent';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { withScheduleDefaults } from '@/lib/medicineSchedule';

type AgentState = 'idle' | 'listening' | 'processing' | 'responding' | 'error';

// On-demand voice/type command assistant — tap the mic (or type/tap a hint)
// any time to add a medicine, log a meal, mark something taken, or ask
// what's pending. Deliberately does NOT proactively interrupt on its own:
// that job now belongs to (1) DailyCheckIn.tsx, shown on app open and
// reachable any time, which reads the same live DB state this assistant
// writes to, and (2) push notifications (send-reminders edge function),
// which work even when the app is closed — unlike a foreground-only
// setTimeout-based nag ever could. This used to also run its own proactive
// greeting and a 5-tier escalating per-medicine reminder schedule; removed
// because it duplicated (worse — foreground-only, and asked things already
// answered) both of those, and because generate_alerts() (migration 0007,
// pg_cron) already covers "senior hasn't taken a medicine" server-side
// regardless of whether the app is even open.
const VoiceAssistantButton = () => {
  const {
    t, language, role, currentUserId,
    sharedMedicines, setSharedMedicines, markMedicineTaken,
    wellbeing, setWellbeing, addAlert,
    refreshData,
  } = useApp();

  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [showPanel, setShowPanel] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [, setLastAction] = useState<AgentAction | null>(null);
  const [manualInput, setManualInput] = useState('');

  // Always-fresh ref so reminder timeouts (from an explicit "remind me
  // later" command) read current medicine state, not a stale closure.
  const sharedMedicinesRef = useRef(sharedMedicines);
  useEffect(() => { sharedMedicinesRef.current = sharedMedicines; }, [sharedMedicines]);

  // Track active snooze timeouts so they're cancelled on unmount.
  const reminderTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { reminderTimeoutsRef.current.forEach(clearTimeout); }, []);

  // ─── Robust speak helper: native TTS on mobile, Web Speech API on browser ───
  const doSpeak = useCallback((text: string, onEnd?: () => void) => {
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      TextToSpeech.speak({
        text,
        lang: language === 'hi' ? 'hi-IN' : 'en-US',
        rate: 0.9,
        pitch: 1.0,
        volume: 1.0,
        category: 'ambient',
      })
        .then(() => { onEnd?.(); })
        .catch(() => { onEnd?.(); });
      return;
    }

    if (!('speechSynthesis' in window)) { onEnd?.(); return; }

    window.speechSynthesis.cancel();

    const trySpeak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'hi' ? 'hi-IN' : 'en-US';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.onend = () => { onEnd?.(); };
      utterance.onerror = () => { onEnd?.(); };
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
    };

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      trySpeak();
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        trySpeak();
      };
      setTimeout(trySpeak, 500);
    }
  }, [language]);

  const speakResponse = useCallback((text: string) => {
    doSpeak(text);
  }, [doSpeak]);

  // ─── Helper: get medicines due around current time ───
  const getMedicinesDueNow = useCallback(() => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    return sharedMedicinesRef.current.filter(med => {
      if (med.taken) return false;
      const slots = med.timing.split(',').map(s => s.trim());
      return slots.some(slot => {
        const [h, m] = slot.split(':').map(Number);
        if (isNaN(h)) return false;
        const slotMinutes = h * 60 + (m || 0);
        // Medicine is "due now" if its time has passed but within the last 4 hours
        return slotMinutes <= nowMinutes && slotMinutes > nowMinutes - 240;
      });
    });
  }, []);

  const {
    transcript,
    isListening,
    error: speechError,
    startListening,
    stopListening,
    isSupported,
  } = useSpeechRecognition(language);

  // Update state when listening changes
  useEffect(() => {
    if (isListening) {
      setAgentState('listening');
    }
  }, [isListening]);

  // Handle speech errors
  useEffect(() => {
    if (speechError) {
      setAgentState('error');
      setResponseText(speechError);
    }
  }, [speechError]);

  // Process transcript when speech recognition ends
  useEffect(() => {
    if (!isListening && transcript && agentState === 'listening') {
      handleTranscript(transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isListening, transcript]);

  const handleTranscript = async (text: string) => {
    setAgentState('processing');

    try {
      const action = await processVoiceCommand(text);
      setLastAction(action);
      await executeAction(action);
    } catch (e) {
      setAgentState('error');
      setResponseText(t(
        'Something went wrong. Please try again.',
        'कुछ गलत हो गया। कृपया फिर से कोशिश करें।'
      ));
    }
  };

  const executeAction = useCallback(async (action: AgentAction) => {
    const response = language === 'en' ? action.responseEn : action.responseHi;
    setResponseText(response);
    setAgentState('responding');
    speakResponse(response);

    switch (action.intent) {
      case 'add_medicine': {
        const { name, dosage, frequency, beforeAfterFood } = action.params;
        if (!name) break;

        let timing = '09:00';
        const freq = (frequency || '').toLowerCase();
        if (freq.includes('twice')) timing = '08:00, 20:00';
        else if (freq.includes('thrice')) timing = '08:00, 14:00, 20:00';
        else if (freq.includes('night')) timing = '21:00';
        else if (freq.includes('morning')) timing = '08:00';

        const newMedicine = {
          ...withScheduleDefaults({
            name: `${name} ${dosage || ''}`.trim(),
            nameHi: `${name} ${dosage || ''}`.trim(),
            dosage: dosage || 'As directed',
            frequency: frequency || 'once daily',
            timing,
            beforeAfterFood: (beforeAfterFood as 'before' | 'after' | 'with' | 'any') || 'any',
            confidence: 100,
          }, crypto.randomUUID()),
          taken: false,
        };

        await setSharedMedicines([...sharedMedicines, newMedicine]);
        toast({
          title: t('Medicine Added', 'दवाई जोड़ी गई'),
          description: t(
            `${newMedicine.name} has been added to your list.`,
            `${newMedicine.name} आपकी सूची में जोड़ दी गई।`
          ),
        });
        break;
      }

      case 'mark_medicine_taken': {
        const { medicineName } = action.params;

        if (medicineName === 'all') {
          // Only mark medicines that are DUE NOW (time-appropriate)
          const dueMeds = getMedicinesDueNow();
          if (dueMeds.length === 0) {
            const pendingMeds = sharedMedicines.filter(m => !m.taken);
            if (pendingMeds.length === 0) {
              setResponseText(t('All medicines are already taken!', 'सभी दवाइयाँ पहले से ली जा चुकी हैं!'));
              break;
            }
            // If nothing due now, mark the next upcoming one
            for (const med of pendingMeds.slice(0, 1)) {
              await markMedicineTaken(med.id);
            }
          } else {
            for (const med of dueMeds) {
              await markMedicineTaken(med.id);
            }
            const names = dueMeds.map(m => m.name).join(', ');
            const msg = t(
              `Marked ${names} as taken.`,
              `${dueMeds.map(m => m.nameHi || m.name).join(', ')} को ली गई के रूप में अंकित किया।`
            );
            setResponseText(msg);
            speakResponse(msg);
          }
          toast({
            title: t('Medicines Taken', 'दवाइयाँ ली गईं'),
          });
        } else {
          // Find matching medicine by name
          const pendingMeds = sharedMedicines.filter(m => !m.taken);
          const match = pendingMeds.find(m =>
            m.name.toLowerCase().includes((medicineName || '').toLowerCase())
          );
          if (match) {
            await markMedicineTaken(match.id);
            toast({
              title: t('Medicine Taken', 'दवाई ली गई'),
              description: t(`${match.name} marked as taken.`, `${match.name} ली गई।`),
            });
          } else if (pendingMeds.length > 0) {
            // No exact match — mark the one closest to current time
            const dueMeds = getMedicinesDueNow();
            const target = dueMeds.length > 0 ? dueMeds[0] : pendingMeds[0];
            await markMedicineTaken(target.id);
            toast({
              title: t('Medicine Taken', 'दवाई ली गई'),
              description: t(`${target.name} marked as taken.`, `${target.name} ली गई।`),
            });
          }
        }
        break;
      }

      case 'log_meal': {
        const { mealType } = action.params;
        if (currentUserId && mealType) {
          const mt = mealType.toLowerCase() as 'breakfast' | 'lunch' | 'dinner' | 'snack';
          if (['breakfast', 'lunch', 'dinner', 'snack'].includes(mt)) {
            await db.logMeal(currentUserId, mt, true);
          }
        }
        toast({
          title: t('Meal Logged', 'भोजन दर्ज'),
          description: t(
            `${mealType || 'Meal'} has been recorded.`,
            `${mealType || 'भोजन'} दर्ज कर दिया गया।`
          ),
        });
        break;
      }

      case 'record_wellbeing': {
        const { mood, painArea } = action.params;
        const moodValue = mood as 'good' | 'okay' | 'not_well';

        await setWellbeing({
          mood: moodValue,
          painArea: painArea || null,
          timestamp: new Date().toISOString(),
        });

        if (moodValue === 'not_well') {
          await addAlert({
            type: 'distress',
            message: `Senior reported not feeling well${painArea ? ` (${painArea} pain)` : ''} via voice assistant`,
            messageHi: `बुज़ुर्ग ने आवाज़ सहायक के ज़रिए बताया कि तबीयत ठीक नहीं${painArea ? ` (${painArea} में दर्द)` : ''}`,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            severity: 'critical',
          });
        }

        toast({
          title: t('Wellbeing Recorded', 'स्वास्थ्य दर्ज'),
          description: t(
            `Your mood has been recorded as "${moodValue}".`,
            `आपका मूड "${moodValue}" के रूप में दर्ज किया गया।`
          ),
        });
        break;
      }

      case 'check_medicines': {
        const pending = sharedMedicines.filter(m => !m.taken);
        const taken = sharedMedicines.filter(m => m.taken);

        if (sharedMedicines.length === 0) {
          const msg = t('You have no medicines scheduled.', 'आपकी कोई दवाई निर्धारित नहीं है।');
          setResponseText(msg);
          speakResponse(msg);
        } else {
          const msg = t(
            `You have ${pending.length} pending and ${taken.length} taken. ${pending.length > 0 ? 'Pending: ' + pending.map(m => m.name).join(', ') : 'All done!'}`,
            `${pending.length} बाकी और ${taken.length} ली गई। ${pending.length > 0 ? 'बाकी: ' + pending.map(m => m.nameHi || m.name).join(', ') : 'सब हो गया!'}`
          );
          setResponseText(msg);
          speakResponse(msg);
        }
        break;
      }

      case 'check_status': {
        const pending = sharedMedicines.filter(m => !m.taken);
        const moodText = wellbeing?.mood
          ? t(`Mood: ${wellbeing.mood}`, `मूड: ${wellbeing.mood === 'good' ? 'अच्छा' : wellbeing.mood === 'okay' ? 'ठीक' : 'अच्छा नहीं'}`)
          : t('No mood check-in today', 'आज कोई मूड चेक-इन नहीं');

        const msg = t(
          `Today's status — ${moodText}. Medicines: ${pending.length} pending out of ${sharedMedicines.length}.`,
          `आज की स्थिति — ${moodText}। दवाइयाँ: ${sharedMedicines.length} में से ${pending.length} बाकी।`
        );
        setResponseText(msg);
        speakResponse(msg);
        break;
      }

      case 'snooze_medicine': {
        const { medicineName } = action.params;
        const REMIND_MS = 30 * 60 * 1000;
        const medLabel = medicineName || t('your medicine', 'दवाई');

        const isMedicineTaken = () => {
          const meds = sharedMedicinesRef.current;
          if (!medicineName) return meds.every(m => m.taken);
          const match = meds.find(m => m.name.toLowerCase().includes(medicineName.toLowerCase()));
          return match ? match.taken : false;
        };

        toast({
          title: t('Reminder Set', 'याद दिलाएंगे'),
          description: t(`I'll remind you about ${medLabel} in 30 minutes.`, `30 मिनट बाद ${medicineName || 'दवाई'} की याद दिलाएंगे।`),
        });

        const t1 = setTimeout(() => {
          if (isMedicineTaken()) return;
          const msg1 = t(`Reminder: Time to take ${medLabel}!`, `याद दिलाना: ${medicineName || 'दवाई'} लेने का समय!`);
          speakResponse(msg1);
          toast({ title: t('Medicine Reminder', 'दवाई की याद'), description: msg1 });

          const t2 = setTimeout(async () => {
            if (isMedicineTaken()) return;
            const msg2 = t(`Please take ${medLabel} now!`, `कृपया अभी ${medicineName || 'दवाई'} लें!`);
            speakResponse(msg2);
            toast({ title: t('Urgent: Medicine Not Taken', 'तुरंत: दवाई नहीं ली'), description: msg2, variant: 'destructive' });

            await addAlert({
              type: 'medication',
              message: `Senior has not taken ${medLabel} after two reminders (60 min overdue).`,
              messageHi: `बुज़ुर्ग ने दो बार याद दिलाने के बाद भी ${medicineName || 'दवाई'} नहीं ली।`,
              time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              severity: 'critical',
            });
          }, REMIND_MS);
          reminderTimeoutsRef.current.push(t2);
        }, REMIND_MS);
        reminderTimeoutsRef.current.push(t1);
        break;
      }

      case 'unknown':
      default:
        break;
    }

    await refreshData();
  }, [language, sharedMedicines, wellbeing, setSharedMedicines, markMedicineTaken, setWellbeing, addAlert, refreshData, t, speakResponse, currentUserId, getMedicinesDueNow]);

  const handleToggle = () => {
    if (agentState === 'listening') {
      stopListening();
    } else if (agentState === 'idle' || agentState === 'responding' || agentState === 'error') {
      setShowPanel(true);
      setResponseText('');
      setManualInput('');
      setLastAction(null);
      startListening();
    }
  };

  const handleClose = () => {
    stopListening();
    if (Capacitor.isNativePlatform()) {
      TextToSpeech.stop().catch(() => {});
    } else {
      window.speechSynthesis?.cancel();
    }
    setShowPanel(false);
    setAgentState('idle');
    setResponseText('');
    setManualInput('');
    setLastAction(null);
  };

  // Typed or tapped answer — same effect as a recognized spoken transcript,
  // for whenever speech recognition doesn't catch what was said.
  const submitManualAnswer = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    stopListening();
    setManualInput('');
    handleTranscript(trimmed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopListening]);

  const HINTS: { display: string; value: string }[] = [
    { display: t('"I took my medicine"', '"मैंने दवाई खा ली"'), value: t('I took my medicine', 'मैंने दवाई खा ली') },
    { display: t('"Remind me later"', '"बाद में याद दिलाओ"'), value: t('remind me later', 'बाद में याद दिलाओ') },
    { display: t('"I had breakfast"', '"मैंने नाश्ता कर लिया"'), value: t('I had breakfast', 'मैंने नाश्ता कर लिया') },
    { display: t('"I\'m feeling good"', '"मैं ठीक हूँ"'), value: t("I'm feeling good", 'मैं ठीक हूँ') },
    { display: t('"What medicines are pending?"', '"कौन सी दवाई बाकी है?"'), value: t('what medicines are pending', 'कौन सी दवाई बाकी है') },
  ];

  // Only show for senior role
  if (role !== 'senior') return null;

  return (
    <>
      {/* Floating mic button */}
      <button
        onClick={handleToggle}
        className={`fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-300 ${
          agentState === 'listening'
            ? 'bg-red-500 animate-pulse scale-110'
            : agentState === 'processing'
            ? 'bg-amber-500'
            : 'gradient-primary shadow-glow-primary pulse-gentle'
        }`}
        aria-label={t('Voice Assistant', 'आवाज़ सहायक')}
      >
        {agentState === 'listening' ? (
          <MicOff className="w-7 h-7" />
        ) : agentState === 'processing' ? (
          <Loader2 className="w-7 h-7 animate-spin" />
        ) : (
          <Mic className="w-7 h-7" />
        )}
      </button>

      {/* Voice assistant panel */}
      {showPanel && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 mb-4 animate-slide-up">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  agentState === 'listening' ? 'bg-red-500 animate-pulse' :
                  agentState === 'processing' ? 'bg-amber-500 animate-pulse' :
                  agentState === 'responding' ? 'bg-green-500' :
                  agentState === 'error' ? 'bg-red-500' :
                  'bg-gray-400'
                }`} />
                <span className="text-lg font-semibold text-gray-800">
                  {agentState === 'listening' && t('Listening...', 'सुन रहा हूँ...')}
                  {agentState === 'processing' && t('Understanding...', 'समझ रहा हूँ...')}
                  {agentState === 'responding' && t('Done!', 'हो गया!')}
                  {agentState === 'error' && t('Error', 'त्रुटि')}
                  {agentState === 'idle' && t('Voice Assistant', 'आवाज़ सहायक')}
                </span>
              </div>
              <button onClick={handleClose} className="p-2 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Listening visualization */}
            {agentState === 'listening' && (
              <div className="flex items-center justify-center gap-1 py-8">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-1.5 bg-primary rounded-full animate-bounce"
                    style={{
                      height: `${20 + Math.random() * 30}px`,
                      animationDelay: `${i * 0.1}s`,
                      animationDuration: '0.6s',
                    }}
                  />
                ))}
              </div>
            )}

            {/* Type an answer — for when speech recognition doesn't catch it */}
            {agentState === 'listening' && (
              <div className="flex gap-2 mb-4">
                <input
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitManualAnswer(manualInput); }}
                  placeholder={t('Or type here...', 'या यहाँ लिखें...')}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-base text-gray-800"
                />
                <button
                  onClick={() => submitManualAnswer(manualInput)}
                  disabled={!manualInput.trim()}
                  className="px-4 py-3 rounded-xl gradient-primary text-white font-semibold disabled:opacity-40"
                >
                  {t('Send', 'भेजें')}
                </button>
              </div>
            )}

            {/* Transcript */}
            {transcript && (
              <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                <p className="text-sm text-gray-500 mb-1">
                  {t('You said:', 'आपने कहा:')}
                </p>
                <p className="text-elder-lg text-gray-800 font-medium">
                  "{transcript}"
                </p>
              </div>
            )}

            {/* Processing */}
            {agentState === 'processing' && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <span className="ml-3 text-gray-600">
                  {t('Processing your command...', 'आपका आदेश समझ रहा हूँ...')}
                </span>
              </div>
            )}

            {/* Response */}
            {responseText && (agentState === 'responding' || agentState === 'error') && (
              <div className={`rounded-2xl p-4 mb-4 ${
                agentState === 'error' ? 'bg-red-50' : 'bg-green-50'
              }`}>
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => doSpeak(responseText)}
                    className={`mt-0.5 flex-shrink-0 p-1 rounded-full hover:bg-white/50 transition-colors ${
                      agentState === 'error' ? 'text-red-500' : 'text-green-600'
                    }`}
                    aria-label={t('Tap to hear', 'सुनने के लिए टैप करें')}
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                  <p className={`text-elder-lg ${
                    agentState === 'error' ? 'text-red-700' : 'text-green-800'
                  }`}>
                    {responseText}
                  </p>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {(agentState === 'responding' || agentState === 'error' || agentState === 'idle') && (
                <button
                  onClick={handleToggle}
                  className="flex-1 py-4 rounded-2xl gradient-primary text-white text-elder-lg font-semibold flex items-center justify-center gap-2"
                >
                  <Mic className="w-5 h-5" />
                  {t('Speak Again', 'फिर से बोलें')}
                </button>
              )}
              {agentState === 'listening' && (
                <button
                  onClick={stopListening}
                  className="flex-1 py-4 rounded-2xl bg-red-500 text-white text-elder-lg font-semibold flex items-center justify-center gap-2"
                >
                  <MicOff className="w-5 h-5" />
                  {t('Stop', 'रुकें')}
                </button>
              )}
            </div>

            {/* Help hints — tappable, not just examples */}
            {!transcript && agentState !== 'processing' && (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-400 mb-2">
                  {t('Try saying or tap one:', 'कह कर देखें या टैप करें:')}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {HINTS.map((hint, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => submitManualAnswer(hint.value)}
                      className="text-xs bg-gray-100 text-gray-600 rounded-full px-3 py-1.5 hover:bg-gray-200 active:scale-95 transition-all"
                    >
                      {hint.display}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Browser support warning */}
            {!isSupported && (
              <div className="mt-4 bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-sm text-amber-700">
                  {t(
                    'Voice recognition is not supported in this browser. Please use Chrome or Edge.',
                    'इस ब्राउज़र में आवाज़ पहचान उपलब्ध नहीं है। कृपया Chrome या Edge का उपयोग करें।'
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default VoiceAssistantButton;
