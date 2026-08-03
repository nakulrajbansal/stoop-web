import { describe, expect, it } from 'vitest';
import { parsePushRegistration } from './push-registration';

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
