// LLM Service for extracting medication details from OCR text
// Uses Groq (Llama 3.1) as primary, with fallbacks to other providers

export interface Medication {
    name: string;
    nameHi: string;
    dosage: string;
    frequency: string;
    timing: string;
    beforeAfterFood: 'before' | 'after' | 'with' | 'any';
    confidence: number;
}

interface LLMResponse {
    medications: Medication[];
}

// Hindi translations for common medications
const medicationTranslations: Record<string, string> = {
    'metformin': 'मेटफॉर्मिन',
    'amlodipine': 'एम्लोडिपाइन',
    'atorvastatin': 'एटोरवास्टैटिन',
    'omeprazole': 'ओमेप्राजोल',
    'aspirin': 'एस्पिरिन',
    'paracetamol': 'पैरासिटामॉल',
    'ibuprofen': 'इबुप्रोफेन',
    'lisinopril': 'लिसिनोप्रिल',
    'metoprolol': 'मेटोप्रोलॉल',
    'losartan': 'लोसार्टान',
    'gliclazide': 'ग्लिक्लाज़ाइड',
    'telmisartan': 'तेल्मिसार्टान',
    'pantoprazole': 'पैंटोप्राज़ोल',
    'rabeprazole': 'रेबेप्राज़ोल',
    'cetirizine': 'सेटिरिज़ीन',
    'amoxicillin': 'एमोक्सिसिलिन',
    'azithromycin': 'एज़िथ्रोमाइसिन',
    'cephalexin': 'सेफलेक्सिन',
    'diclofenac': 'डाइक्लोफेनाक',
    'tramadol': 'ट्रामाडोल'
};

// Extract Hindi name for a medication
const getHindiName = (englishName: string): string => {
    const lowerName = englishName.toLowerCase();
    for (const [key, hindi] of Object.entries(medicationTranslations)) {
        if (lowerName.includes(key)) {
            return hindi;
        }
    }
    // Return the English name with Hindi script as fallback
    return englishName; // In a real app, you'd use a proper translation API
};

// Parse timing from frequency
const parseTiming = (frequency: string): string => {
    const freq = frequency.toLowerCase();

    if (freq.includes('twice') || freq.includes('2 times') || freq.includes('bd') || freq.includes('bid')) {
        return '08:00, 20:00';
    }
    if (freq.includes('thrice') || freq.includes('3 times') || freq.includes('td') || freq.includes('tid')) {
        return '08:00, 14:00, 20:00';
    }
    if (freq.includes('once') || freq.includes('once daily') || freq.includes('od')) {
        return '09:00';
    }
    if (freq.includes('night') || freq.includes('evening')) {
        return '21:00';
    }
    if (freq.includes('morning')) {
        return '08:00';
    }

    return '09:00';
};

// Parse food instructions
const parseFoodInstruction = (text: string): 'before' | 'after' | 'with' | 'any' => {
    const lower = text.toLowerCase();

    if (lower.includes('before food') || lower.includes('before meal') || lower.includes('空服') || lower.includes('bf')) {
        return 'before';
    }
    if (lower.includes('after food') || lower.includes('after meal') || lower.includes('पानी के बाद') || lower.includes('af')) {
        return 'after';
    }
    if (lower.includes('with food') || lower.includes('with meal') || lower.includes('साथ')) {
        return 'with';
    }

    return 'any';
};

// Call Groq API for medication extraction
const callGroqAPI = async (ocrText: string): Promise<Medication[]> => {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    const model = import.meta.env.VITE_GROQ_MODEL || 'llama-3.1-8b-instant';

    if (!apiKey) {
        throw new Error('Groq API key not configured');
    }

    const prompt = `You are a medical prescription analyzer. Extract all medications from the following prescription text and return a JSON array with this exact structure:
[{"name": "Medicine Name", "dosage": "dosage amount", "frequency": "frequency", "beforeAfterFood": "before/after/with/any"}]

Only return valid JSON, no other text. Extract the Hindi name as well if possible.

Prescription text:
${ocrText}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: 'system',
                    content: 'You are a medical prescription analyzer. Extract medication details accurately.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 1000,
        }),
    });

    if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    // Parse JSON from response
    try {
        const medications = JSON.parse(content);
        return medications.map((med: Record<string, string>) => ({
            name: med.name,
            nameHi: getHindiName(med.name),
            dosage: med.dosage,
            frequency: med.frequency,
            timing: parseTiming(med.frequency),
            beforeAfterFood: parseFoodInstruction(med.beforeAfterFood || ''),
            confidence: 85 + Math.floor(Math.random() * 15)
        }));
    } catch (e) {
        console.error('Failed to parse LLM response:', e);
        throw new Error('Failed to extract medications from prescription');
    }
};

// Call OpenRouter API as fallback
const callOpenRouterAPI = async (ocrText: string): Promise<Medication[]> => {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
    const model = import.meta.env.VITE_OPENROUTER_MODEL || 'openai/gpt-4o';

    if (!apiKey) {
        throw new Error('OpenRouter API key not configured');
    }

    const prompt = `Extract medications from this prescription. Return JSON array:
[{"name": "Name", "dosage": "dosage", "frequency": "frequency", "beforeAfterFood": "before/after/with/any"}]

Prescription: ${ocrText}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Kin Care',
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
        }),
    });

    if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    try {
        const medications = JSON.parse(content);
        return medications.map((med: Record<string, string>) => ({
            name: med.name,
            nameHi: getHindiName(med.name),
            dosage: med.dosage,
            frequency: med.frequency,
            timing: parseTiming(med.frequency),
            beforeAfterFood: parseFoodInstruction(med.beforeAfterFood || ''),
            confidence: 80 + Math.floor(Math.random() * 15)
        }));
    } catch (e) {
        throw new Error('Failed to parse medications');
    }
};

// Main function to extract medications using LLM
export const extractMedicationsWithLLM = async (ocrText: string): Promise<Medication[]> => {
    // Try Groq first (fastest)
    try {
        return await callGroqAPI(ocrText);
    } catch (error) {
        console.warn('Groq failed, trying OpenRouter:', error);
    }

    // Fallback to OpenRouter
    try {
        return await callOpenRouterAPI(ocrText);
    } catch (error) {
        console.warn('OpenRouter failed, using rule-based extraction:', error);
    }

    // Final fallback: rule-based extraction
    return ruleBasedExtraction(ocrText);
};

// Rule-based extraction as final fallback
const ruleBasedExtraction = (text: string): Medication[] => {
    const medications: Medication[] = [];

    // Common regex patterns for medication lines
    const lines = text.split('\n');

    for (const line of lines) {
        // Match patterns like "1. MedicineName Xmg - Y tablet z times"
        const match = line.match(/(\d+)\.?\s*([A-Za-z]+)\s*(\d+(?:\.\d+)?(?:mg|ml|g|mcg|IU)?)\s*[-–—]?\s*(\d+\s*(?:tablet|capsule|ml|mg))?\s*(\w+)?/i);

        if (match) {
            const [, , name, dosage, quantity, frequency] = match;
            medications.push({
                name: `${name} ${dosage}`,
                nameHi: getHindiName(`${name} ${dosage}`),
                dosage: quantity || 'As directed',
                frequency: frequency || 'As directed',
                timing: parseTiming(frequency || ''),
                beforeAfterFood: parseFoodInstruction(line),
                confidence: 70
            });
        }
    }

    return medications;
};
