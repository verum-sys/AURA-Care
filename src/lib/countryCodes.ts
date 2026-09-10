export interface CountryCode {
  iso: string;
  name: string;
  flag: string;
  dial: string; // e.g. "+91" — always includes the leading "+"
}

// India first (this app's home market), then the rest alphabetically by
// country name. Covers India plus the countries the Indian diaspora most
// commonly calls home from — a caregiver here is often abroad while the
// senior they're caring for is in India.
export const COUNTRY_CODES: CountryCode[] = [
  { iso: 'IN', name: 'India', flag: '🇮🇳', dial: '+91' },
  { iso: 'AU', name: 'Australia', flag: '🇦🇺', dial: '+61' },
  { iso: 'BH', name: 'Bahrain', flag: '🇧🇭', dial: '+973' },
  { iso: 'BD', name: 'Bangladesh', flag: '🇧🇩', dial: '+880' },
  { iso: 'CA', name: 'Canada', flag: '🇨🇦', dial: '+1' },
  { iso: 'FR', name: 'France', flag: '🇫🇷', dial: '+33' },
  { iso: 'DE', name: 'Germany', flag: '🇩🇪', dial: '+49' },
  { iso: 'KW', name: 'Kuwait', flag: '🇰🇼', dial: '+965' },
  { iso: 'MY', name: 'Malaysia', flag: '🇲🇾', dial: '+60' },
  { iso: 'NP', name: 'Nepal', flag: '🇳🇵', dial: '+977' },
  { iso: 'NZ', name: 'New Zealand', flag: '🇳🇿', dial: '+64' },
  { iso: 'OM', name: 'Oman', flag: '🇴🇲', dial: '+968' },
  { iso: 'PK', name: 'Pakistan', flag: '🇵🇰', dial: '+92' },
  { iso: 'QA', name: 'Qatar', flag: '🇶🇦', dial: '+974' },
  { iso: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', dial: '+966' },
  { iso: 'SG', name: 'Singapore', flag: '🇸🇬', dial: '+65' },
  { iso: 'ZA', name: 'South Africa', flag: '🇿🇦', dial: '+27' },
  { iso: 'LK', name: 'Sri Lanka', flag: '🇱🇰', dial: '+94' },
  { iso: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', dial: '+971' },
  { iso: 'GB', name: 'United Kingdom', flag: '🇬🇧', dial: '+44' },
  { iso: 'US', name: 'United States', flag: '🇺🇸', dial: '+1' },
];

export const DEFAULT_DIAL = '+91';

/** Longest-dial-code-first, so "+1" doesn't shadow codes that share its prefix pattern. */
const BY_LENGTH_DESC = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length);

/**
 * Splits a stored phone string (e.g. "+91 98765 43210" or legacy
 * "+917678240134") into its dial code and local number. Falls back to the
 * default dial code for anything that doesn't start with a known "+code".
 */
export function splitPhone(value: string | null | undefined): { dial: string; number: string } {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { dial: DEFAULT_DIAL, number: '' };
  if (!trimmed.startsWith('+')) return { dial: DEFAULT_DIAL, number: trimmed };
  const match = BY_LENGTH_DESC.find(c => trimmed.startsWith(c.dial));
  if (!match) return { dial: DEFAULT_DIAL, number: trimmed };
  return { dial: match.dial, number: trimmed.slice(match.dial.length).trim() };
}

/** Combines a dial code + local number back into the single stored string, or null if the number is empty. */
export function joinPhone(dial: string, number: string): string | null {
  const trimmedNumber = number.trim();
  return trimmedNumber ? `${dial} ${trimmedNumber}` : null;
}
