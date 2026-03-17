import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Mic, MicOff, X, Loader2, Volume2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';
import * as db from '@/lib/database';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { processVoiceCommand, AgentAction } from '@/lib/voiceAgent';

type AgentState = 'idle' | 'listening' | 'processing' | 'responding' | 'error';

const VoiceAssistantButton = () => {
  const {
    t, language, role, loading, currentUserId,
    sharedMedicines, setSharedMedicines, markMedicineTaken,
    wellbeing, setWellbeing, addAlert,
    refreshData,
  } = useApp();

  const location = useLocation();

  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [showPanel, setShowPanel] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [lastAction, setLastAction] = useState<AgentAction | null>(null);

  // Always-fresh ref so reminder timeouts read current medicine state, not stale closure
  const sharedMedicinesRef = useRef(sharedMedicines);
  useEffect(() => { sharedMedicinesRef.current = sharedMedicines; }, [sharedMedicines]);

  // Track active reminder timeouts so we can cancel them on unmount
  const reminderTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { reminderTimeoutsRef.current.forEach(clearTimeout); }, []);

  const speakResponse = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'hi' ? 'hi-IN' : 'en-US';
      utterance.rate = 0.9;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
  }, [language]);

  // ─── Proactive greeting: once per session, on first senior page load ───
  useEffect(() => {
    // sessionStorage persists across reloads but clears when tab/browser closes
    if (sessionStorage.getItem('kincare_greeted') === '1') return;
    if (role !== 'senior' || loading) return;
    if (!location.pathname.startsWith('/senior')) return;

    sessionStorage.setItem('kincare_greeted', '1');

    const timer = setTimeout(() => {
      const msg = buildProactiveGreeting();
      if (!msg) return;

      setShowPanel(true);
      setResponseText(msg);
      setAgentState('responding');

      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(msg);
        utterance.lang = language === 'hi' ? 'hi-IN' : 'en-US';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.onend = () => { startListening(); };
        window.speechSynthesis.speak(utterance);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [role, loading, location.pathname]);

  /** Build a greeting with exactly 3 questions: medicines (time-aware), meal, caretaker call */
  const buildProactiveGreeting = (): string => {
    const now = new Date();
    const hour = now.getHours();
    const nowMinutes = hour * 60 + now.getMinutes(); // current time in total minutes

    const greetEn = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const greetHi = hour < 12 ? 'सुप्रभात' : hour < 17 ? 'नमस्कार' : 'शुभ संध्या';

    const parts: { en: string; hi: string }[] = [];

    // ── 1. Medicines whose scheduled time has already passed and are not taken ──
    const overdue = sharedMedicinesRef.current.filter(med => {
      if (med.taken) return false;
      // timing can be "09:00" or "08:00, 20:00" — check if ANY slot is past
      const slots = med.timing.split(',').map(s => s.trim());
      return slots.some(slot => {
        const [h, m] = slot.split(':').map(Number);
        if (isNaN(h)) return false;
        return (h * 60 + (m || 0)) <= nowMinutes;
      });
    });

    if (overdue.length > 0) {
      const names = overdue.map(m => m.name).join(', ');
      const namesHi = overdue.map(m => m.nameHi || m.name).join(', ');
      parts.push({
        en: `You have ${overdue.length} medicine${overdue.length > 1 ? 's' : ''} due: ${names}. Did you take ${overdue.length > 1 ? 'them' : 'it'}?`,
        hi: `आपकी ${overdue.length} दवाई का समय हो चुका है: ${namesHi}। क्या आपने ${overdue.length > 1 ? 'ये' : 'यह'} ली?`,
      });
    }

    // ── 2. Closest past meal ──
    // breakfast < 11, lunch 11-15, dinner >= 15 (ask about the one whose window has passed)
    let mealEn: string;
    let mealHi: string;
    if (hour >= 15) {
      mealEn = 'lunch'; mealHi = 'दोपहर का खाना';
    } else if (hour >= 11) {
      mealEn = 'breakfast'; mealHi = 'नाश्ता';
    } else {
      // Before 11am — still ask about breakfast (current meal)
      mealEn = 'breakfast'; mealHi = 'नाश्ता';
    }
    parts.push({
      en: `Have you had your ${mealEn}?`,
      hi: `क्या आपने ${mealHi} खाया?`,
    });

    // ── 3. Call caretaker ──
    parts.push({
      en: 'Would you like to call your caretaker?',
      hi: 'क्या आप अपने देखभालकर्ता को कॉल करना चाहेंगे?',
    });

    const fullEn = `${greetEn}! ${parts.map(p => p.en).join(' ')}`;
    const fullHi = `${greetHi}! ${parts.map(p => p.hi).join(' ')}`;

    return language === 'en' ? fullEn : fullHi;
  };

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

    // Speak the response
    speakResponse(response);

    switch (action.intent) {
      case 'add_medicine': {
        const { name, dosage, frequency, beforeAfterFood } = action.params;
        if (!name) break;

        // Parse timing from frequency
        let timing = '09:00';
        const freq = (frequency || '').toLowerCase();
        if (freq.includes('twice')) timing = '08:00, 20:00';
        else if (freq.includes('thrice')) timing = '08:00, 14:00, 20:00';
        else if (freq.includes('night')) timing = '21:00';
        else if (freq.includes('morning')) timing = '08:00';

        const newMedicine = {
          id: crypto.randomUUID(),
          name: `${name} ${dosage || ''}`.trim(),
          nameHi: `${name} ${dosage || ''}`.trim(),
          dosage: dosage || 'As directed',
          frequency: frequency || 'once daily',
          timing,
          beforeAfterFood: (beforeAfterFood as 'before' | 'after' | 'with' | 'any') || 'any',
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
        const pendingMeds = sharedMedicines.filter(m => !m.taken);

        if (pendingMeds.length === 0) {
          setResponseText(t(
            'All medicines are already taken!',
            'सभी दवाइयाँ पहले से ली जा चुकी हैं!'
          ));
          break;
        }

        if (medicineName === 'all') {
          // Mark all pending as taken
          for (const med of pendingMeds) {
            await markMedicineTaken(med.id);
          }
          toast({
            title: t('All Medicines Taken', 'सभी दवाइयाँ ली गईं'),
            description: t(
              `${pendingMeds.length} medicines marked as taken.`,
              `${pendingMeds.length} दवाइयाँ ली गई के रूप में अंकित।`
            ),
          });
        } else {
          // Find matching medicine
          const match = pendingMeds.find(m =>
            m.name.toLowerCase().includes((medicineName || '').toLowerCase())
          );
          if (match) {
            await markMedicineTaken(match.id);
            toast({
              title: t('Medicine Taken', 'दवाई ली गई'),
              description: t(
                `${match.name} marked as taken.`,
                `${match.name} ली गई के रूप में अंकित।`
              ),
            });
          } else {
            // If no specific match, mark the first pending
            await markMedicineTaken(pendingMeds[0].id);
            toast({
              title: t('Medicine Taken', 'दवाई ली गई'),
              description: t(
                `${pendingMeds[0].name} marked as taken.`,
                `${pendingMeds[0].name} ली गई के रूप में अंकित।`
              ),
            });
          }
        }
        break;
      }

      case 'log_meal': {
        const { mealType } = action.params;
        // Persist to DB
        if (currentUserId && mealType) {
          const mt = mealType.toLowerCase() as 'breakfast' | 'lunch' | 'dinner' | 'snack';
          if (['breakfast', 'lunch', 'dinner', 'snack'].includes(mt)) {
            await db.logMeal(currentUserId, mt, true);
          }
        }
        toast({
          title: t('Meal Logged', 'भोजन दर्ज'),
          description: t(
            `${mealType || 'Meal'} has been recorded. Great job staying healthy!`,
            `${mealType || 'भोजन'} दर्ज कर दिया गया। स्वस्थ रहने के लिए बधाई!`
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

        // Auto-alert caregiver if not well
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
          const noMedsMsg = t(
            'You have no medicines scheduled.',
            'आपकी कोई दवाई निर्धारित नहीं है।'
          );
          setResponseText(noMedsMsg);
          speakResponse(noMedsMsg);
        } else {
          const statusMsg = t(
            `You have ${pending.length} pending and ${taken.length} taken medicines. ${pending.length > 0 ? 'Pending: ' + pending.map(m => m.name).join(', ') : 'All done!'}`,
            `आपकी ${pending.length} बाकी और ${taken.length} ली गई दवाइयाँ हैं। ${pending.length > 0 ? 'बाकी: ' + pending.map(m => m.nameHi || m.name).join(', ') : 'सब हो गया!'}`
          );
          setResponseText(statusMsg);
          speakResponse(statusMsg);
        }
        break;
      }

      case 'check_status': {
        const pending = sharedMedicines.filter(m => !m.taken);
        const moodText = wellbeing?.mood
          ? t(
              `Mood: ${wellbeing.mood}`,
              `मूड: ${wellbeing.mood === 'good' ? 'अच्छा' : wellbeing.mood === 'okay' ? 'ठीक' : 'अच्छा नहीं'}`
            )
          : t('No mood check-in today', 'आज कोई मूड चेक-इन नहीं');

        const statusMsg = t(
          `Today's status — ${moodText}. Medicines: ${pending.length} pending out of ${sharedMedicines.length}.`,
          `आज की स्थिति — ${moodText}। दवाइयाँ: ${sharedMedicines.length} में से ${pending.length} बाकी।`
        );
        setResponseText(statusMsg);
        speakResponse(statusMsg);
        break;
      }

      case 'snooze_medicine': {
        const { medicineName } = action.params;
        const REMIND_MS = 30 * 60 * 1000; // always 30 min per stage
        const medLabel = medicineName || t('your medicine', 'दवाई');

        // Check if the snoozed medicine has been taken (reads live ref, not stale closure)
        const isMedicineTaken = () => {
          const meds = sharedMedicinesRef.current;
          if (!medicineName) return meds.every(m => m.taken);
          const match = meds.find(m =>
            m.name.toLowerCase().includes(medicineName.toLowerCase())
          );
          return match ? match.taken : false;
        };

        toast({
          title: t('Reminder Set', 'याद दिलाएंगे'),
          description: t(
            `I'll remind you about ${medLabel} in 30 minutes.`,
            `30 मिनट बाद ${medicineName || 'दवाई'} की याद दिलाएंगे।`
          ),
        });

        // Stage 1 — 30 min: gentle reminder
        const t1 = setTimeout(() => {
          if (isMedicineTaken()) return;

          const msg1 = t(
            `Reminder: Time to take ${medLabel}!`,
            `याद दिलाना: ${medicineName || 'दवाई'} लेने का समय हो गया!`
          );
          speakResponse(msg1);
          toast({ title: t('Medicine Reminder', 'दवाई की याद'), description: msg1 });

          // Stage 2 — 60 min: urgent reminder + caregiver alert if still not taken
          const t2 = setTimeout(async () => {
            if (isMedicineTaken()) return;

            const msg2 = t(
              `Please take ${medLabel} now! You missed the last reminder.`,
              `कृपया अभी ${medicineName || 'दवाई'} लें! आपने पिछली याद को छोड़ दिया।`
            );
            speakResponse(msg2);
            toast({
              title: t('Urgent: Medicine Not Taken', 'तुरंत: दवाई नहीं ली'),
              description: msg2,
              variant: 'destructive',
            });

            // Alert caregiver — medicine missed for 60+ minutes
            await addAlert({
              type: 'medication',
              message: `Senior has not taken ${medLabel} after two reminders (60 min overdue). Immediate attention needed.`,
              messageHi: `बुज़ुर्ग ने दो बार याद दिलाने के बाद भी ${medicineName || 'दवाई'} नहीं ली (60 मिनट से अधिक देरी)। तुरंत ध्यान दें।`,
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

    // Refresh data to sync
    await refreshData();
  }, [language, sharedMedicines, wellbeing, setSharedMedicines, markMedicineTaken, setWellbeing, addAlert, refreshData, t]);

  const handleToggle = () => {
    if (agentState === 'listening') {
      stopListening();
    } else if (agentState === 'idle' || agentState === 'responding' || agentState === 'error') {
      setShowPanel(true);
      setResponseText('');
      setLastAction(null);
      startListening();
    }
  };

  const handleClose = () => {
    stopListening();
    window.speechSynthesis?.cancel();
    setShowPanel(false);
    setAgentState('idle');
    setResponseText('');
    setLastAction(null);
  };

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
                  <Volume2 className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                    agentState === 'error' ? 'text-red-500' : 'text-green-600'
                  }`} />
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

            {/* Help hints */}
            {!transcript && agentState !== 'processing' && (
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-400 mb-2">
                  {t('Try saying:', 'कह कर देखें:')}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    t('"I took my medicine"', '"मैंने दवाई खा ली"'),
                    t('"Remind me later"', '"बाद में याद दिलाओ"'),
                    t('"I had breakfast"', '"मैंने नाश्ता कर लिया"'),
                    t('"I\'m feeling good"', '"मैं ठीक हूँ"'),
                    t('"What medicines are pending?"', '"कौन सी दवाई बाकी है?"'),
                  ].map((hint, i) => (
                    <span key={i} className="text-xs bg-gray-100 text-gray-600 rounded-full px-3 py-1.5">
                      {hint}
                    </span>
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
