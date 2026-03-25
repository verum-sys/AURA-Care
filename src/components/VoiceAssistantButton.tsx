import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Mic, MicOff, X, Loader2, Volume2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { toast } from '@/hooks/use-toast';
import * as db from '@/lib/database';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { processVoiceCommand, AgentAction } from '@/lib/voiceAgent';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

type AgentState = 'idle' | 'listening' | 'processing' | 'responding' | 'error';

// Conversation question types for multi-turn flow
type ConvoStep = 'medicine' | 'meal' | 'caretaker' | null;

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
  const [, setLastAction] = useState<AgentAction | null>(null);

  // Multi-turn conversation state
  const convoStepRef = useRef<ConvoStep>(null);
  const convoQueueRef = useRef<ConvoStep[]>([]);

  // Always-fresh ref so reminder timeouts read current medicine state, not stale closure
  const sharedMedicinesRef = useRef(sharedMedicines);
  useEffect(() => { sharedMedicinesRef.current = sharedMedicines; }, [sharedMedicines]);

  // Track active reminder timeouts so we can cancel them on unmount
  const reminderTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { reminderTimeoutsRef.current.forEach(clearTimeout); }, []);

  // Track notification timeouts for medicine reminders
  const notifTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { notifTimeoutsRef.current.forEach(clearTimeout); }, []);

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

  // ─── Multi-turn: ask the next question in the queue ───
  const askNextQuestion = useCallback(() => {
    const queue = convoQueueRef.current;
    if (queue.length === 0) {
      convoStepRef.current = null;
      return;
    }

    const next = queue.shift()!;
    convoStepRef.current = next;

    let question = '';
    const hour = new Date().getHours();

    switch (next) {
      case 'medicine': {
        const dueMeds = getMedicinesDueNow();
        if (dueMeds.length === 0) {
          // No medicines due — skip to next question
          askNextQuestion();
          return;
        }
        const names = dueMeds.map(m => language === 'hi' ? (m.nameHi || m.name) : m.name).join(', ');
        question = language === 'en'
          ? `You have ${dueMeds.length} medicine${dueMeds.length > 1 ? 's' : ''} due: ${names}. Did you take ${dueMeds.length > 1 ? 'them' : 'it'}?`
          : `आपकी ${dueMeds.length} दवाई का समय हो चुका है: ${names}। क्या आपने ${dueMeds.length > 1 ? 'ये' : 'यह'} ली?`;
        break;
      }
      case 'meal': {
        const mealEn = hour >= 15 ? 'lunch' : 'breakfast';
        const mealHi = hour >= 15 ? 'दोपहर का खाना' : 'नाश्ता';
        question = language === 'en'
          ? `Have you had your ${mealEn}?`
          : `क्या आपने ${mealHi} खाया?`;
        break;
      }
      case 'caretaker':
        question = language === 'en'
          ? 'Would you like to call your caretaker?'
          : 'क्या आप अपने देखभालकर्ता को कॉल करना चाहेंगे?';
        break;
    }

    setResponseText(question);
    setAgentState('responding');
    doSpeak(question, () => {
      startListening();
    });
  }, [doSpeak, language, getMedicinesDueNow]);

  // ─── Handle answer to a multi-turn question ───
  const handleConvoAnswer = useCallback(async (transcript: string) => {
    const step = convoStepRef.current;
    const lower = transcript.toLowerCase();
    const isYes = /\b(yes|yeah|haan|ha|ji|ho gaya|kar liya|kha li|le li|taken|done|finished)\b/i.test(lower);
    const isNo = /\b(no|nahi|nah|not yet|abhi nahi|baad mein)\b/i.test(lower);

    let reply = '';

    switch (step) {
      case 'medicine': {
        if (isYes) {
          // Mark only medicines that are DUE NOW as taken
          const dueMeds = getMedicinesDueNow();
          for (const med of dueMeds) {
            await markMedicineTaken(med.id);
          }
          const names = dueMeds.map(m => language === 'hi' ? (m.nameHi || m.name) : m.name).join(', ');
          reply = language === 'en'
            ? `Great! I've marked ${names} as taken.`
            : `बहुत अच्छा! ${names} को ली गई के रूप में अंकित कर दिया।`;
          toast({
            title: t('Medicines Taken', 'दवाइयाँ ली गईं'),
            description: reply,
          });
        } else if (isNo) {
          reply = language === 'en'
            ? "Okay, I'll remind you in 30 minutes."
            : "ठीक है, 30 मिनट बाद याद दिलाऊँगा।";
          // Set snooze reminder for due medicines
          const dueMeds = getMedicinesDueNow();
          const medNames = dueMeds.map(m => m.name).join(', ');
          const REMIND_MS = 30 * 60 * 1000;
          const t1 = setTimeout(() => {
            const stillPending = sharedMedicinesRef.current.filter(m =>
              dueMeds.some(d => d.id === m.id) && !m.taken
            );
            if (stillPending.length === 0) return;
            const reminderMsg = t(
              `Reminder: Time to take ${medNames}!`,
              `याद दिलाना: ${medNames} लेने का समय!`
            );
            speakResponse(reminderMsg);
            toast({ title: t('Medicine Reminder', 'दवाई की याद'), description: reminderMsg });
          }, REMIND_MS);
          reminderTimeoutsRef.current.push(t1);
        } else {
          reply = language === 'en'
            ? "I didn't catch that. Let's move on."
            : "मैं समझ नहीं पाया। आगे बढ़ते हैं।";
        }
        break;
      }
      case 'meal': {
        const hour = new Date().getHours();
        const mealType = hour >= 15 ? 'lunch' : 'breakfast';
        if (isYes) {
          if (currentUserId) {
            await db.logMeal(currentUserId, mealType as 'breakfast' | 'lunch', true);
          }
          reply = language === 'en'
            ? `Good, I've logged your ${mealType}.`
            : `अच्छा, आपका ${mealType === 'lunch' ? 'दोपहर का खाना' : 'नाश्ता'} दर्ज कर दिया।`;
          toast({
            title: t('Meal Logged', 'भोजन दर्ज'),
            description: reply,
          });
        } else if (isNo) {
          reply = language === 'en'
            ? "Please try to eat soon. It's important for your health."
            : "कृपया जल्दी खाना खाएं। यह आपकी सेहत के लिए ज़रूरी है।";
        } else {
          reply = language === 'en'
            ? "I didn't catch that. Let's continue."
            : "मैं समझ नहीं पाया। आगे बढ़ते हैं।";
        }
        break;
      }
      case 'caretaker': {
        if (isYes) {
          reply = language === 'en'
            ? "I'll connect you to your caretaker. This feature is coming soon."
            : "मैं आपको आपके देखभालकर्ता से जोड़ता हूँ। यह सुविधा जल्द आ रही है।";
        } else {
          reply = language === 'en'
            ? "Alright! Have a wonderful day. Take care!"
            : "ठीक है! आपका दिन शुभ हो। अपना ख्याल रखें!";
        }
        break;
      }
    }

    setResponseText(reply);
    setAgentState('responding');

    // Speak reply, then move to next question
    doSpeak(reply, () => {
      // Small delay before next question
      setTimeout(() => {
        askNextQuestion();
      }, 800);
    });

    await refreshData();
  }, [doSpeak, getMedicinesDueNow, markMedicineTaken, language, t, currentUserId, speakResponse, refreshData, askNextQuestion]);

  // ─── Proactive greeting: multi-turn, one question at a time ───
  useEffect(() => {
    if (sessionStorage.getItem('kincare_greeted') === '1') return;
    if (role !== 'senior' || loading) return;
    if (!location.pathname.startsWith('/senior')) return;

    sessionStorage.setItem('kincare_greeted', '1');

    const timer = setTimeout(() => {
      const hour = new Date().getHours();
      const greet = language === 'en'
        ? (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening')
        : (hour < 12 ? 'सुप्रभात' : hour < 17 ? 'नमस्कार' : 'शुभ संध्या');

      const greeting = language === 'en'
        ? `${greet}! I'm your Kin Care assistant. Let me check on you.`
        : `${greet}! मैं आपका किन केयर सहायक हूँ। चलिए आपका हाल जानते हैं।`;

      // Set up the question queue: medicine → meal → caretaker
      convoQueueRef.current = ['medicine', 'meal', 'caretaker'];
      convoStepRef.current = null;

      setShowPanel(true);
      setResponseText(greeting);
      setAgentState('responding');

      // Speak greeting, then start first question
      doSpeak(greeting, () => {
        setTimeout(() => {
          askNextQuestion();
        }, 600);
      });
    }, 1500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, loading, location.pathname, doSpeak, language]);

  // ─── Medicine reminder notifications: escalating schedule per medicine ───
  // Schedule: T-15 (gentle) → T+0 (time now!) → T+10 (still pending) → T+20 (urgent) → T+30 (caregiver alert)
  useEffect(() => {
    if (role !== 'senior' || loading) return;

    // Clear old notification timeouts
    notifTimeoutsRef.current.forEach(clearTimeout);
    notifTimeoutsRef.current = [];

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Helper: check if a specific medicine is still not taken
    const isStillPending = (medId: string) => {
      const m = sharedMedicinesRef.current.find(cm => cm.id === medId);
      return m ? !m.taken : false;
    };

    // Helper: schedule a single reminder
    const scheduleReminder = (delayMs: number, callback: () => void) => {
      if (delayMs < 0) return; // time already passed
      const id = setTimeout(callback, delayMs);
      notifTimeoutsRef.current.push(id);
    };

    sharedMedicines.forEach(med => {
      if (med.taken) return;
      const slots = med.timing.split(',').map(s => s.trim());
      const medNameEn = med.name;
      const medNameHi = med.nameHi || med.name;
      const medName = language === 'hi' ? medNameHi : medNameEn;

      slots.forEach(slot => {
        const [h, m] = slot.split(':').map(Number);
        if (isNaN(h)) return;
        const slotMinutes = h * 60 + (m || 0);

        // ── Reminder 1: T-15 min — Gentle heads-up ──
        const r1Offset = slotMinutes - 15;
        if (r1Offset > nowMinutes) {
          scheduleReminder((r1Offset - nowMinutes) * 60000, () => {
            if (!isStillPending(med.id)) return;
            const msg = language === 'en'
              ? `Heads up: You need to take ${medName} at ${slot}. That's in 15 minutes.`
              : `ध्यान दें: ${medName} ${slot} बजे लेनी है। 15 मिनट बाकी हैं।`;
            setShowPanel(true);
            setResponseText(msg);
            setAgentState('responding');
            doSpeak(msg);
            toast({ title: t('Upcoming Medicine', 'आने वाली दवाई'), description: msg });
          });
        }

        // ── Reminder 2: T+0 — Exact time, asks for response ──
        if (slotMinutes > nowMinutes) {
          scheduleReminder((slotMinutes - nowMinutes) * 60000, () => {
            if (!isStillPending(med.id)) return;
            const msg = language === 'en'
              ? `It's ${slot} now. Time to take ${medName}! Did you take it?`
              : `अभी ${slot} बज गए हैं। ${medName} लेने का समय! क्या आपने ली?`;
            setShowPanel(true);
            setResponseText(msg);
            setAgentState('responding');
            doSpeak(msg, () => { startListening(); });
            toast({ title: t('Medicine Time!', 'दवाई का समय!'), description: msg, variant: 'destructive' });

            // If no reply within 2 minutes → warn caregiver
            scheduleReminder(2 * 60000, async () => {
              if (!isStillPending(med.id)) return;
              await addAlert({
                type: 'medication',
                message: `${medNameEn} reminder at ${slot} — senior did not respond. Medicine may not have been taken.`,
                messageHi: `${medNameHi} की ${slot} बजे याद दिलाई — बुज़ुर्ग ने जवाब नहीं दिया। दवाई शायद नहीं ली गई।`,
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                severity: 'warning',
              });
            });
          });
        }

        // ── Reminder 3: T+10 min — "You still haven't taken it" ──
        const r3Offset = slotMinutes + 10;
        if (r3Offset > nowMinutes) {
          scheduleReminder((r3Offset - nowMinutes) * 60000, () => {
            if (!isStillPending(med.id)) return;
            const msg = language === 'en'
              ? `You still haven't taken ${medName}. It was due at ${slot}. Please take it now.`
              : `आपने अभी तक ${medName} नहीं ली। ${slot} बजे लेनी थी। कृपया अभी लें।`;
            setShowPanel(true);
            setResponseText(msg);
            setAgentState('responding');
            doSpeak(msg, () => { startListening(); });
            toast({ title: t('Medicine Overdue', 'दवाई लेना बाकी'), description: msg });

            // If no reply within 2 minutes → warn caregiver again
            scheduleReminder(2 * 60000, async () => {
              if (!isStillPending(med.id)) return;
              await addAlert({
                type: 'medication',
                message: `${medNameEn} is 10+ min overdue (${slot}). Senior not responding to reminders.`,
                messageHi: `${medNameHi} 10+ मिनट से बाकी (${slot})। बुज़ुर्ग याद दिलाने पर जवाब नहीं दे रहे।`,
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                severity: 'warning',
              });
            });
          });
        }

        // ── Reminder 4: T+20 min — Urgent warning ──
        const r4Offset = slotMinutes + 20;
        if (r4Offset > nowMinutes) {
          scheduleReminder((r4Offset - nowMinutes) * 60000, async () => {
            if (!isStillPending(med.id)) return;
            const msg = language === 'en'
              ? `Urgent: ${medName} is 20 minutes overdue! Please take it right now.`
              : `ज़रूरी: ${medName} 20 मिनट से बाकी है! कृपया अभी लें।`;
            setShowPanel(true);
            setResponseText(msg);
            setAgentState('responding');
            doSpeak(msg, () => { startListening(); });
            toast({ title: t('Urgent Reminder!', 'ज़रूरी याद!'), description: msg, variant: 'destructive' });

            // Send escalated alert to caregiver
            await addAlert({
              type: 'medication',
              message: `URGENT: ${medNameEn} is 20 min overdue (${slot}). Senior has not responded to any reminder.`,
              messageHi: `ज़रूरी: ${medNameHi} 20 मिनट से बाकी (${slot})। बुज़ुर्ग ने किसी भी याद का जवाब नहीं दिया।`,
              time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              severity: 'critical',
            });
          });
        }

        // ── Reminder 5: T+30 min — Alert caregiver ──
        const r5Offset = slotMinutes + 30;
        if (r5Offset > nowMinutes) {
          scheduleReminder((r5Offset - nowMinutes) * 60000, async () => {
            if (!isStillPending(med.id)) return;
            const msg = language === 'en'
              ? `${medName} has not been taken for 30 minutes. Your caregiver has been notified.`
              : `${medName} 30 मिनट से नहीं ली गई। आपके देखभालकर्ता को सूचित कर दिया गया है।`;
            setShowPanel(true);
            setResponseText(msg);
            setAgentState('responding');
            doSpeak(msg);
            toast({ title: t('Caregiver Notified', 'देखभालकर्ता को सूचित किया'), description: msg, variant: 'destructive' });

            // Send critical alert to caregiver
            await addAlert({
              type: 'medication',
              message: `${medNameEn} was not taken at scheduled time ${slot}. 30 minutes overdue. Immediate attention needed.`,
              messageHi: `${medNameHi} निर्धारित समय ${slot} पर नहीं ली गई। 30 मिनट की देरी। तुरंत ध्यान दें।`,
              time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              severity: 'critical',
            });
          });
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, loading, sharedMedicines, language, doSpeak, t, addAlert]);

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
      // If we're in a multi-turn conversation, route to convo handler
      if (convoStepRef.current) {
        handleConvoAnswer(transcript);
      } else {
        handleTranscript(transcript);
      }
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
      // Reset conversation state when user manually taps mic
      convoStepRef.current = null;
      convoQueueRef.current = [];
      setShowPanel(true);
      setResponseText('');
      setLastAction(null);
      startListening();
    }
  };

  const handleClose = () => {
    stopListening();
    convoStepRef.current = null;
    convoQueueRef.current = [];
    if (Capacitor.isNativePlatform()) {
      TextToSpeech.stop().catch(() => {});
    } else {
      window.speechSynthesis?.cancel();
    }
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

            {/* Help hints */}
            {!transcript && agentState !== 'processing' && !convoStepRef.current && (
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
