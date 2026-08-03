import { describe, expect, it } from 'vitest';
import { parsePushRegistration, parsePushRevocation } from './push-registration';

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';

describe('parsePushRegistration', () => {
  it('accepts a well-formed iOS registration', () => {
    expect(
      parsePushRegistration({
        token: TOKEN,
        platform: 'ios',
        installationId: '  install-123  ',
        appVersion: '1.0.0'
      })
    ).toEqual({
      ok: true,
      value: {
        expo_push_token: TOKEN,
        platform: 'ios',
        installation_id: 'install-123',
        app_version: '1.0.0'
      }
    });
  });

  it('accepts expoPushToken as an alias and omits an absent app version', () => {
    const result = parsePushRegistration({
      expoPushToken: TOKEN,
      platform: 'android',
      installationId: 'i-1'
    });
    expect(result).toEqual({
      ok: true,
      value: { expo_push_token: TOKEN, platform: 'android', installation_id: 'i-1', app_version: null }
    });
  });

  it('rejects a missing or malformed token', () => {
    expect(parsePushRegistration({ platform: 'ios', installationId: 'i-1' }).ok).toBe(false);
    expect(parsePushRegistration({ token: 'nope', platform: 'ios', installationId: 'i-1' }).ok).toBe(false);
    expect(
      parsePushRegistration({ token: '740f4707bebcf74f9b7c25d48e3358945f', platform: 'ios', installationId: 'i-1' }).ok
    ).toBe(false);
  });

  it('rejects an unknown platform', () => {
    expect(parsePushRegistration({ token: TOKEN, platform: 'web', installationId: 'i-1' }).ok).toBe(false);
    expect(parsePushRegistration({ token: TOKEN, installationId: 'i-1' }).ok).toBe(false);
  });

  it('rejects an empty or oversized installation id', () => {
    expect(parsePushRegistration({ token: TOKEN, platform: 'ios', installationId: '   ' }).ok).toBe(false);
    expect(parsePushRegistration({ token: TOKEN, platform: 'ios', installationId: 'x'.repeat(129) }).ok).toBe(false);
  });

  it('truncates an absurd app version instead of failing the registration', () => {
    const result = parsePushRegistration({
      token: TOKEN,
      platform: 'ios',
      installationId: 'i-1',
      appVersion: 'v'.repeat(100)
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.app_version).toHaveLength(32);
  });

  it('rejects non-object bodies', () => {
    expect(parsePushRegistration(null).ok).toBe(false);
    expect(parsePushRegistration('token').ok).toBe(false);
    expect(parsePushRegistration(undefined).ok).toBe(false);
  });
});

/**
 * Revocation used to take the token from the query string, which wrote a device
 * credential into every access log between the phone and the server. It now
 * comes in the body and is validated the same way a registration is.
 */
describe('parsePushRevocation', () => {
  it('accepts a token on its own', () => {
    expect(parsePushRevocation({ token: TOKEN })).toEqual({
      ok: true,
      value: { token: TOKEN, installationId: null }
    });
  });

  it('accepts an installation id on its own', () => {
    expect(parsePushRevocation({ installationId: ' install-123 ' })).toEqual({
      ok: true,
      value: { token: null, installationId: 'install-123' }
    });
  });

  it('accepts both together', () => {
    expect(parsePushRevocation({ token: TOKEN, installationId: 'install-123' })).toEqual({
      ok: true,
      value: { token: TOKEN, installationId: 'install-123' }
    });
  });

  it('refuses a request that names nothing, so a bare DELETE cannot wipe every token', () => {
    expect(parsePushRevocation({})).toEqual({ ok: false, error: 'token or installationId required' });
    expect(parsePushRevocation({ installationId: '   ' })).toEqual({
      ok: false,
      error: 'token or installationId required'
    });
    expect(parsePushRevocation(null)).toEqual({ ok: false, error: 'Invalid request' });
  });

  it('refuses anything that is not an Expo push token', () => {
    expect(parsePushRevocation({ token: 'not-a-token' })).toEqual({ ok: false, error: 'Invalid push token' });
    expect(parsePushRevocation({ token: '' })).toEqual({ ok: false, error: 'Invalid push token' });
  });

  it('refuses an over-long installation id', () => {
    expect(parsePushRevocation({ installationId: 'x'.repeat(129) })).toEqual({
      ok: false,
      error: 'Invalid installation id'
    });
  });
});
