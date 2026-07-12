import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_LEVEL,
  InvalidDurationError,
  MAX_CUSTOM_DURATION_SECONDS,
  MIN_CUSTOM_DURATION_SECONDS,
  decideCapability,
  isGrantExpired,
  makeGrant,
  pruneExpired,
  validateCustomDuration,
  type Grant,
} from './permissions';
import { CAPABILITIES } from './protocol';

const NOW = 1_700_000_000;

describe('capability ladder', () => {
  it('orders capabilities by sensitivity', () => {
    expect(CAPABILITY_LEVEL.getPublicKey).toBeLessThan(
      CAPABILITY_LEVEL.getRelays,
    );
    expect(CAPABILITY_LEVEL.getRelays).toBeLessThan(CAPABILITY_LEVEL.signEvent);
    expect(CAPABILITY_LEVEL.signEvent).toBeLessThan(
      CAPABILITY_LEVEL['nip44.encrypt'],
    );
  });

  it('assigns a level to every capability', () => {
    for (const capability of CAPABILITIES) {
      expect(CAPABILITY_LEVEL[capability]).toBeGreaterThan(0);
    }
  });
});

describe('makeGrant', () => {
  it('stamps level and creation time', () => {
    const grant = makeGrant('signEvent', 'forever', NOW);
    expect(grant).toEqual({
      condition: 'forever',
      level: CAPABILITY_LEVEL.signEvent,
      createdAt: NOW,
    });
  });

  it('refuses to store single-use approvals', () => {
    expect(() => makeGrant('signEvent', 'single', NOW)).toThrow(
      'single-use approvals are never stored',
    );
  });

  it('validates custom durations', () => {
    const grant = makeGrant('signEvent', 'expirable_custom', NOW, 3600);
    expect(grant.durationSeconds).toBe(3600);
    expect(() => makeGrant('signEvent', 'expirable_custom', NOW)).toThrow(
      InvalidDurationError,
    );
  });
});

describe('validateCustomDuration', () => {
  it('accepts the boundary values', () => {
    expect(validateCustomDuration(MIN_CUSTOM_DURATION_SECONDS)).toBe(
      MIN_CUSTOM_DURATION_SECONDS,
    );
    expect(validateCustomDuration(MAX_CUSTOM_DURATION_SECONDS)).toBe(
      MAX_CUSTOM_DURATION_SECONDS,
    );
  });

  it('rejects values outside the bounds and non-integers', () => {
    expect(() =>
      validateCustomDuration(MIN_CUSTOM_DURATION_SECONDS - 1),
    ).toThrow(InvalidDurationError);
    expect(() =>
      validateCustomDuration(MAX_CUSTOM_DURATION_SECONDS + 1),
    ).toThrow(InvalidDurationError);
    expect(() => validateCustomDuration(61.5)).toThrow(InvalidDurationError);
  });
});

describe('isGrantExpired', () => {
  it('never expires forever and no grants', () => {
    const forever = makeGrant('signEvent', 'forever', NOW);
    expect(
      isGrantExpired(forever, NOW + MAX_CUSTOM_DURATION_SECONDS * 10),
    ).toBe(false);
    const no: Grant = { condition: 'no', level: 0, createdAt: NOW };
    expect(isGrantExpired(no, NOW + MAX_CUSTOM_DURATION_SECONDS * 10)).toBe(
      false,
    );
  });

  it('expires fixed conditions exactly at their boundary', () => {
    const grant = makeGrant('signEvent', 'expirable_5m', NOW);
    expect(isGrantExpired(grant, NOW + 299)).toBe(false);
    expect(isGrantExpired(grant, NOW + 300)).toBe(true);
  });

  it('expires custom conditions at createdAt + durationSeconds', () => {
    const grant = makeGrant('signEvent', 'expirable_custom', NOW, 60);
    expect(isGrantExpired(grant, NOW + 59)).toBe(false);
    expect(isGrantExpired(grant, NOW + 60)).toBe(true);
  });
});

describe('decideCapability', () => {
  it('asks when no grant exists', () => {
    expect(decideCapability(undefined, 'getPublicKey', NOW)).toBe('ask');
  });

  it('denies when the stored condition is no', () => {
    const no: Grant = { condition: 'no', level: 0, createdAt: NOW };
    expect(decideCapability(no, 'getPublicKey', NOW)).toBe('deny');
  });

  it('allows implied lower capabilities', () => {
    const grant = makeGrant('signEvent', 'forever', NOW);
    expect(decideCapability(grant, 'getPublicKey', NOW)).toBe('allow');
    expect(decideCapability(grant, 'getRelays', NOW)).toBe('allow');
    expect(decideCapability(grant, 'signEvent', NOW)).toBe('allow');
  });

  it('asks for higher capabilities than granted', () => {
    const grant = makeGrant('getPublicKey', 'forever', NOW);
    expect(decideCapability(grant, 'signEvent', NOW)).toBe('ask');
    expect(decideCapability(grant, 'nip44.decrypt', NOW)).toBe('ask');
  });

  it('asks again after expiry', () => {
    const grant = makeGrant('signEvent', 'expirable_1h', NOW);
    expect(decideCapability(grant, 'signEvent', NOW + 3599)).toBe('allow');
    expect(decideCapability(grant, 'signEvent', NOW + 3600)).toBe('ask');
  });
});

describe('pruneExpired', () => {
  it('drops only expired grants and reports change', () => {
    const permissions = {
      'live.example': makeGrant('signEvent', 'forever', NOW),
      'stale.example': makeGrant('signEvent', 'expirable_5m', NOW - 3600),
    };
    const { pruned, changed } = pruneExpired(permissions, NOW);
    expect(changed).toBe(true);
    expect(Object.keys(pruned)).toEqual(['live.example']);
  });

  it('reports no change when everything is live', () => {
    const permissions = {
      'live.example': makeGrant('signEvent', 'forever', NOW),
    };
    const { pruned, changed } = pruneExpired(permissions, NOW);
    expect(changed).toBe(false);
    expect(Object.keys(pruned)).toEqual(['live.example']);
  });
});
