/** Business WhatsApp (India). Override with NEXT_PUBLIC_WHATSAPP_NUMBER. */
export const WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, '') || '919441115952';

export const WHATSAPP_PREFILL = [
  'Hello VB Digital,',
  '',
  'I would like to enquire about school ID cards.',
  '',
  'School name: ',
  'Address: ',
  '',
  'Please fill in the school name and address above.',
].join('\n');

export function whatsappChatUrl() {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_PREFILL)}`;
}
