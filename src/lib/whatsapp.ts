// Builds a wa.me deep link that opens WhatsApp with a pre-filled message to
// a specific number — used to invite another caregiver to download the app.
// wa.me requires the number in international format with no leading "+" or
// separators; this app is India-only elsewhere (IST scheduling, +91
// placeholders), so a bare 10-digit number is assumed to be Indian.
export function buildWhatsAppShareUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}
