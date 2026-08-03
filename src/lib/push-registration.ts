import { isExpoPushToken } from '@/lib/push';

/**
 * Validation for the push-token registration endpoint, kept separate from the
 * route so it can be tested without a request or a database.
 */

export type PushRegistration = {
  expo_push_token: string;
  platform: 'ios' | 'android';
  installation_id: string;
  app_version: string | null;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_INSTALLATION_ID = 128;
const MAX_APP_VERSION = 32;

export function parsePushRegistration(input: unknown): ParseResult<PushRegistration> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid request' };
  const body = input as Record<string, unknown>;

  const token = body.token ?? body.expoPushToken;
  if (!isExpoPushToken(token)) return { ok: false, error: 'Invalid push token' };

  const platform = body.platform;
  if (platform !== 'ios' && platform !== 'android') return { ok: false, error: 'Invalid platform' };

  const installationId = typeof body.installationId === 'string' ? body.installationId.trim() : '';
  if (!installationId || installationId.length > MAX_INSTALLATION_ID) {
    return { ok: false, error: 'Invalid installation id' };
  }

  const rawVersion = typeof body.appVersion === 'string' ? body.appVersion.trim() : '';
  const appVersion = rawVersion ? rawVersion.slice(0, MAX_APP_VERSION) : null;

  return {
    ok: true,
    value: {
      expo_push_token: token,
      platform,
      installation_id: installationId,
      app_version: appVersion
    }
  };
}

export type PushRevocation = {
  token: string | null;
  installationId: string | null;
};

/**
 * Validation for the revoke endpoint. The token used to travel in the query
 * string, which put a device credential into every access log between the
 * phone and the server; it now comes in the body and is validated the same way
 * a registration is.
 */
export function parsePushRevocation(input: unknown): ParseResult<PushRevocation> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid request' };
  const body = input as Record<string, unknown>;

  const rawToken = body.token ?? body.expoPushToken;
  let token: string | null = null;
  if (rawToken !== undefined && rawToken !== null) {
    if (!isExpoPushToken(rawToken)) return { ok: false, error: 'Invalid push token' };
    token = rawToken;
  }

  let installationId: string | null = null;
  if (typeof body.installationId === 'string' && body.installationId.trim()) {
    installationId = body.installationId.trim();
    if (installationId.length > MAX_INSTALLATION_ID) {
      return { ok: false, error: 'Invalid installation id' };
    }
  }

  if (!token && !installationId) {
    return { ok: false, error: 'token or installationId required' };
  }

  return { ok: true, value: { token, installationId } };
}
