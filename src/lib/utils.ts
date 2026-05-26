/** Normalize a phone input to E.164 format. */
export function toE164(input: string, defaultCountry = '1'): string | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('1') && digits.length === 11) return '+' + digits;
  if (digits.length === 10) return '+' + defaultCountry + digits;
  if (input.startsWith('+')) return '+' + digits;
  return null;
}

/** Validate E.164 phone format. */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
    .substring(0, 2);
}

const AVATAR_COLORS = [
  ['#D4E8D8', '#2A4232'],
  ['#D8E4F0', '#1E3C5A'],
  ['#E8D8D4', '#7A3828'],
  ['#F0E4D0', '#7A4E28'],
  ['#E0D4EC', '#4A3870'],
  ['#D4ECE0', '#1A5C38']
];

export function pickAvatarColors(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const [bg, fg] = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  return { bg, fg };
}

export function calculateExpiry(whenDay: string): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(today);

  switch (whenDay) {
    case 'Today':
      // expire at end of today
      target = today;
      break;
    case 'Tomorrow':
      target.setDate(today.getDate() + 1);
      break;
    case 'This Saturday':
      // 6 = Saturday in JS (0=Sunday)
      target.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7 || 7));
      break;
    case 'This Sunday':
      target.setDate(today.getDate() + ((0 - today.getDay() + 7) % 7 || 7));
      break;
    case 'Next week':
      // 7 days out, falls on whatever weekday it lands on
      target.setDate(today.getDate() + 7);
      break;
    default:
      target.setDate(today.getDate() + 7);
  }

  // Expire at end of the target day (23:59:59 local, then convert)
  target.setHours(23, 59, 59, 999);
  return target.toISOString();
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
export const INTENT_TAGS = [
  { id: 'just-social', label: 'Just social' },
  { id: 'dog-friendly', label: 'Dog-friendly' },
  { id: 'bring-something', label: 'Bring something' },
  { id: 'quiet', label: 'Quiet vibe' },
  { id: 'loud', label: 'Loud vibe' },
  { id: 'free', label: 'Free' },
  { id: 'paid', label: 'Costs money' }
] as const;

export type IntentTagId = typeof INTENT_TAGS[number]['id'];

export function slugify(text: string, fallbackId?: string): string {
  const base = text
    .substring(0, 50)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const suffix = (fallbackId ?? Math.random().toString(36)).replace(/-/g, '').substring(0, 4);
  return base ? `${base}-${suffix}` : `plan-${suffix}`;
}

export function intentTagLabel(id: string): string {
  return INTENT_TAGS.find(t => t.id === id)?.label ?? id;
}
