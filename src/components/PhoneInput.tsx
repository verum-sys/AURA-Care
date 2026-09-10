import { COUNTRY_CODES, splitPhone, joinPhone } from '@/lib/countryCodes';

interface PhoneInputProps {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

// Standardized phone entry used everywhere a phone number is collected
// (dependant's own number, emergency contact, caregiver's own number, an
// invited caregiver's number) — a country-code dropdown plus the local
// number, rendered as one field. The two parts are combined into the same
// single "+91 98765 43210"-style string the rest of the app already stores
// and reads (tel: links, WhatsApp share), so no data-layer changes needed.
const PhoneInput = ({ value, onChange, disabled, placeholder = '98765 43210' }: PhoneInputProps) => {
  const { dial, number } = splitPhone(value);

  return (
    <div className={`flex items-stretch rounded-xl border-2 border-primary/15 bg-card focus-within:border-primary transition-colors ${disabled ? 'opacity-50' : ''}`}>
      <select
        value={dial}
        disabled={disabled}
        onChange={(e) => onChange(joinPhone(e.target.value, number))}
        aria-label="Country code"
        className="w-[92px] flex-shrink-0 rounded-l-xl bg-transparent pl-3 pr-1 py-3 text-sm font-semibold text-foreground focus:outline-none disabled:cursor-not-allowed"
      >
        {COUNTRY_CODES.map(c => (
          <option key={c.iso} value={c.dial}>{c.flag} {c.dial}</option>
        ))}
      </select>
      <div className="w-px my-2 bg-border" />
      <input
        type="tel"
        inputMode="tel"
        disabled={disabled}
        placeholder={placeholder}
        value={number}
        onChange={(e) => onChange(joinPhone(dial, e.target.value))}
        className="flex-1 min-w-0 rounded-r-xl bg-transparent px-3 py-3 text-sm font-semibold text-foreground focus:outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
};

export default PhoneInput;
