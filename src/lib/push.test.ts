import { describe, expect, it, vi } from 'vitest';
import {
  buildPushMessages,
  buildPushPayload,
  chunk,
  deadTokensFromTickets,
  EXPO_PUSH_ENDPOINT,
  isExpoPushToken,
  sendExpoPush,
  type ExpoPushMessage,
  type PushEventKind
} from './push';

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

// Real-looking private strings that must never reach a lock screen.
const SECRETS = [
  'Maya',
  'maya@example.com',
  '+15551234567',
  'hey are you still going saturday',
  'getting a flat white saturday morning before the market gets busy'
];

const ALL_KINDS: PushEventKind[] = ['join_request', 'reply', 'confirmed'];

describe('isExpoPushToken', () => {
  it('accepts Expo push tokens in both spellings', () => {
    expect(isExpoPushToken(TOKEN_A)).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
  });

  it('rejects raw APNs tokens, empty values, and junk', () => {
    expect(isExpoPushToken('740f4707bebcf74f9b7c25d48e3358945f6aa01da5ddb387462c7eaf61bb78ad')).toBe(false);
    expect(isExpoPushToken('')).toBe(false);
    expect(isExpoPushToken(null)).toBe(false);
    expect(isExpoPushToken(undefined)).toBe(false);
    expect(isExpoPushToken(42)).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[abc')).toBe(false);
  });
});

describe('buildPushPayload', () => {
  it('points at the conversation when one is given', () => {
    const payload = buildPushPayload('reply', { conversationId: 'c-123' });
    expect(payload.data.path).toBe('/conversation/c-123');
    expect(payload.data.kind).toBe('reply');
  });

  it('falls back to the inbox when there is no conversation', () => {
    expect(buildPushPayload('reply').data.path).toBe('/inbox');
  });

  it('never puts message text, names, emails, or phone numbers in the payload', () => {
    for (const kind of ALL_KINDS) {
      const payload = buildPushPayload(kind, { conversationId: 'c-123' });
      const serialized = JSON.stringify(payload).toLowerCase();
      for (const secret of SECRETS) {
        expect(serialized).not.toContain(secret.toLowerCase());
      }
    }
  });

  it('carries only kind and path in its data, so nothing extra leaks', () => {
    for (const kind of ALL_KINDS) {
      const payload = buildPushPayload(kind, { conversationId: 'c-123' });
      expect(Object.keys(payload.data).sort()).toEqual(['kind', 'path']);
    }
  });

  it('gives every event non-empty human copy', () => {
    for (const kind of ALL_KINDS) {
      const payload = buildPushPayload(kind);
      expect(payload.title.length).toBeGreaterThan(0);
      expect(payload.body.length).toBeGreaterThan(0);
      expect(payload.title).not.toMatch(/—/); // house style: no em dashes
      expect(payload.body).not.toMatch(/—/);
    }
  });
});

describe('buildPushMessages', () => {
  it('builds one message per valid token and drops invalid ones', () => {
    const messages = buildPushMessages(
      [TOKEN_A, 'not-a-token', TOKEN_B],
      buildPushPayload('join_request', { conversationId: 'c-1' })
    );
    expect(messages.map(m => m.to)).toEqual([TOKEN_A, TOKEN_B]);
    expect(messages[0].sound).toBe('default');
    expect(messages[0].data.path).toBe('/conversation/c-1');
  });

  it('returns nothing when the user has no usable tokens', () => {
    expect(buildPushMessages([], buildPushPayload('reply'))).toEqual([]);
    expect(buildPushMessages(['garbage'], buildPushPayload('reply'))).toEqual([]);
  });
});

describe('chunk', () => {
  it('splits into batches of at most the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns nothing for an empty list', () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it('defaults to Expo\'s 100-message limit', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const batches = chunk(items);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(100);
    expect(batches[2]).toHaveLength(50);
  });

  it('refuses a nonsense size rather than looping forever', () => {
    expect(() => chunk([1, 2], 0)).toThrow();
  });
});

describe('deadTokensFromTickets', () => {
  const messages: ExpoPushMessage[] = buildPushMessages([TOKEN_A, TOKEN_B], buildPushPayload('reply'));

  it('flags only tokens Expo reports as DeviceNotRegistered', () => {
    const dead = deadTokensFromTickets(messages, [
      { status: 'ok', id: '1' },
      { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
    ]);
    expect(dead).toEqual([TOKEN_B]);
  });

  it('keeps tokens that failed for a transient reason', () => {
    const dead = deadTokensFromTickets(messages, [
      { status: 'error', message: 'rate limited', details: { error: 'MessageRateExceeded' } },
      { status: 'error', message: 'boom' }
    ]);
    expect(dead).toEqual([]);
  });

  it('survives a short or empty ticket list', () => {
    expect(deadTokensFromTickets(messages, [])).toEqual([]);
    expect(deadTokensFromTickets([], [{ status: 'ok' }])).toEqual([]);
  });
});

describe('sendExpoPush', () => {
  it('does not call the network when there is nothing to send', async () => {
    const fetchImpl = vi.fn();
    await expect(sendExpoPush([], fetchImpl as unknown as typeof fetch)).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts to Expo and returns one ticket per message', async () => {
    const messages = buildPushMessages([TOKEN_A, TOKEN_B], buildPushPayload('confirmed', { conversationId: 'c-9' }));
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(EXPO_PUSH_ENDPOINT);
      expect(init.method).toBe('POST');
      const sent = JSON.parse(String(init.body));
      expect(sent).toHaveLength(2);
      expect(sent[0].to).toBe(TOKEN_A);
      return {
        ok: true,
        json: async () => ({ data: [{ status: 'ok', id: '1' }, { status: 'ok', id: '2' }] })
      };
    });

    const tickets = await sendExpoPush(messages, fetchImpl as unknown as typeof fetch);
    expect(tickets).toHaveLength(2);
    expect(tickets.every(t => t.status === 'ok')).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('splits more than 100 messages across requests', async () => {
    const tokens = Array.from({ length: 101 }, (_, i) => `ExponentPushToken[t${String(i).padStart(4, '0')}]`);
    const messages = buildPushMessages(tokens, buildPushPayload('reply'));
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: sent.map(() => ({ status: 'ok' })) }) };
    });

    const tickets = await sendExpoPush(messages, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(tickets).toHaveLength(101);
  });

  it('degrades to error tickets when Expo returns a failure status', async () => {
    const messages = buildPushMessages([TOKEN_A], buildPushPayload('reply'));
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));

    const tickets = await sendExpoPush(messages, fetchImpl as unknown as typeof fetch);
    expect(tickets).toEqual([{ status: 'error', message: 'HTTP 503' }]);
  });

  it('never sends anything that is not the generic copy', async () => {
    const messages = buildPushMessages([TOKEN_A], buildPushPayload('join_request', { conversationId: 'c-1' }));
    let body = '';
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      body = String(init.body);
      return { ok: true, json: async () => ({ data: [{ status: 'ok' }] }) };
    });

    await sendExpoPush(messages, fetchImpl as unknown as typeof fetch);
    for (const secret of SECRETS) {
      expect(body.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });
});
