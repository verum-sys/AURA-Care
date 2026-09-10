// Builds a mailto: link that opens the caregiver's own email client with the
// recipient, subject and body pre-filled — same idea as the WhatsApp share
// (buildWhatsAppShareUrl): this app has no backend mail sender, so the
// caregiver reviews and hits send themselves rather than an automatic
// server-side dispatch.
export function buildMailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
