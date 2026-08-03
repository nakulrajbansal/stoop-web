/**
 * Native push notifications, sent through Expo's push service.
 *
 * Privacy rule (deliberate, do not relax): a push notification never carries
 * message text, a plan's text, a phone number, an email, or the other person's
 * name. Lock screens are visible to anyone holding the phone, and Expo's
 * service sees every payload we send. Notifications say only that something
 * happened and carry an in-app path so the app can fetch the real content over
 * an authenticated connection.
 *
 * Email remains the primary channel and is unchanged; push is additive and
 * every send is best effort.
 */

export const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
export const EXPO_PUSH_CHUNK_SIZE = 100;

export type PushEventKind = 'join_request' | 'reply' | 'confirmed';

export type PushContext = {
  /** Conversation the notification points at. Not sensitive on its own. */
  conversationId?: string;
};

export type PushPayload = {
  title: string;
  body: string;
  data: { kind: PushEventKind; path: string };
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: PushPayload['data'];
  sound: 'default';
  priority: 'high';
  channelId: 'default';
  badge?: number;
};

export type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * Expo push tokens look like `ExponentPushToken[xxxxxxxx]`. Anything else is
 * rejected so we never store a raw APNs token or arbitrary text.
 */
const EXPO_TOKEN_SHAPE = /^Expo(nent)?PushToken\[[A-Za-z0-9._-]{1,120}\]$/;

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && EXPO_TOKEN_SHAPE.test(value);
}

/**
 * Generic, content-free copy for every event we push. Changing these strings is
 * a product decision; adding names or message text to them is a privacy
 * regression and the tests will fail.
 */
export function buildPushPayload(kind: PushEventKind, ctx: PushContext = {}): PushPayload {
  const path = ctx.conversationId ? `/conversation/${ctx.conversationId}` : '/inbox';

  switch (kind) {
    case 'join_request':
      return {
        title: 'Someone wants to join your plan',
        body: 'Open Stoop to read their message.',
        data: { kind, path }
      };
    case 'reply':
      return {
        title: 'New reply on Stoop',
        body: 'Open Stoop to read it.',
        data: { kind, path }
      };
    case 'confirmed':
      return {
        title: "You're confirmed",
        body: 'Your plan is set. Open Stoop for the details.',
        data: { kind, path }
      };
  }
}

export function buildPushMessages(tokens: string[], payload: PushPayload): ExpoPushMessage[] {
  return tokens.filter(isExpoPushToken).map(to => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: 'default',
    priority: 'high',
    channelId: 'default'
  }));
}

export function chunk<T>(items: T[], size = EXPO_PUSH_CHUNK_SIZE): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Tokens Expo told us are dead. They must be revoked so we stop paying for
 * sends to uninstalled apps (and so a recycled device never gets someone
 * else's notification).
 */
export function deadTokensFromTickets(messages: ExpoPushMessage[], tickets: ExpoPushTicket[]): string[] {
  const dead: string[] = [];
  tickets.forEach((ticket, i) => {
    const message = messages[i];
    if (!message) return;
    if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      dead.push(message.to);
    }
  });
  return dead;
}

type FetchLike = typeof fetch;

/** POST the messages to Expo in chunks and return the tickets in order. */
export async function sendExpoPush(
  messages: ExpoPushMessage[],
  fetchImpl: FetchLike = fetch
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'accept-encoding': 'gzip, deflate'
  };
  // Only needed when the Expo project enables push security; harmless otherwise.
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  const tickets: ExpoPushTicket[] = [];
  for (const batch of chunk(messages)) {
    const res = await fetchImpl(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch)
    });
    if (!res.ok) {
      // Expo is down or rejecting us. Email already covers this event.
      console.error('expo push send failed:', res.status);
      batch.forEach(() => tickets.push({ status: 'error', message: `HTTP ${res.status}` }));
      continue;
    }
    const json = (await res.json()) as { data?: ExpoPushTicket[] };
    const batchTickets = Array.isArray(json?.data) ? json.data : [];
    batch.forEach((_, i) => tickets.push(batchTickets[i] ?? { status: 'error', message: 'No ticket' }));
  }
  return tickets;
}

/**
 * The admin client is loaded on demand so the payload helpers above stay
 * importable (and unit-testable) without server credentials in the environment.
 */
async function admin() {
  const { supabaseAdmin } = await import('@/lib/supabase/admin');
  return supabaseAdmin;
}

/** Active (not revoked) push tokens for a user. Service role only. */
export async function activeTokensForUser(userId: string): Promise<string[]> {
  const { data, error } = await (await admin())
    .from('push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (error || !data) return [];
  return data.map(r => r.expo_push_token).filter(isExpoPushToken);
}

/**
 * Drop tokens Expo told us are dead. Deleted rather than flagged, for the same
 * reason as a user-initiated revoke: the row is a device identifier tied to a
 * person, it has no further use once the device is gone, and the privacy policy
 * says it is removed.
 */
export async function revokeTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await (await admin())
    .from('push_tokens')
    .delete()
    .in('expo_push_token', tokens);
}

/**
 * Send one event to every device a user has registered. Never throws: a push
 * failure must not break posting, messaging, or confirming.
 */
export async function notifyUser(userId: string, kind: PushEventKind, ctx: PushContext = {}): Promise<void> {
  try {
    const tokens = await activeTokensForUser(userId);
    if (tokens.length === 0) return;

    const messages = buildPushMessages(tokens, buildPushPayload(kind, ctx));
    if (messages.length === 0) return;

    const tickets = await sendExpoPush(messages);
    await revokeTokens(deadTokensFromTickets(messages, tickets));
  } catch (e) {
    console.error('push notify failed (non-fatal):', e);
  }
}
