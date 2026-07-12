import { describe, expect, it } from 'vitest';
import { makeGrant, MIN_CUSTOM_DURATION_SECONDS } from '@/lib/permissions';
import {
  CAPABILITY_LABEL,
  InvalidDurationInputError,
  capabilitiesAtLevel,
  formatRemaining,
  grantExpiryLabel,
  levelLabel,
  parseDurationInput,
  truncateMiddle,
} from './format';

const NOW = 1_700_000_000;

describe('truncateMiddle', () => {
  it('leaves short values untouched', () => {
    expect(truncateMiddle('npub1short')).toBe('npub1short');
  });

  it('keeps the head and tail of long values', () => {
    const npub = `npub1${'a'.repeat(58)}`;
    const truncated = truncateMiddle(npub);
    expect(truncated).toBe(`npub1aaaaaaa…${'a'.repeat(6)}`);
    expect(truncated.length).toBeLessThan(npub.length);
  });
});

describe('capability levels', () => {
  it('level 1 grants only the public key', () => {
    expect(capabilitiesAtLevel(1)).toEqual(['getPublicKey']);
  });

  it('level 20 grants everything', () => {
    expect(capabilitiesAtLevel(20)).toHaveLength(
      Object.keys(CAPABILITY_LABEL).length,
    );
  });

  it('levelLabel joins the granted capability labels', () => {
    expect(levelLabel(5)).toBe('read your public key, read your relay list');
  });

  it('levelLabel handles a level below every capability', () => {
    expect(levelLabel(0)).toBe('nothing');
  });
});

describe('parseDurationInput', () => {
  it('parses each unit into seconds', () => {
    expect(parseDurationInput('90s')).toBe(90);
    expect(parseDurationInput('15m')).toBe(15 * 60);
    expect(parseDurationInput('2h')).toBe(2 * 60 * 60);
    expect(parseDurationInput('1d')).toBe(24 * 60 * 60);
  });

  it('tolerates whitespace and uppercase units', () => {
    expect(parseDurationInput(' 5 M ')).toBe(5 * 60);
  });

  it('rejects malformed input', () => {
    expect(() => parseDurationInput('soon')).toThrow(InvalidDurationInputError);
    expect(() => parseDurationInput('5')).toThrow(InvalidDurationInputError);
    expect(() => parseDurationInput('m5')).toThrow(InvalidDurationInputError);
  });

  it('applies the custom-duration bounds', () => {
    expect(() =>
      parseDurationInput(`${String(MIN_CUSTOM_DURATION_SECONDS - 1)}s`),
    ).toThrow('outside');
  });
});

describe('formatRemaining', () => {
  it('picks the largest fitting unit', () => {
    expect(formatRemaining(45)).toBe('45 s');
    expect(formatRemaining(120)).toBe('2 m');
    expect(formatRemaining(7200)).toBe('2 h');
    expect(formatRemaining(172_800)).toBe('2 d');
  });
});

describe('grantExpiryLabel', () => {
  it('reports forever grants as never expiring', () => {
    const grant = makeGrant('signEvent', 'forever', NOW);
    expect(grantExpiryLabel(grant, NOW)).toBe('never');
  });

  it('reports remaining time on live grants', () => {
    const grant = makeGrant('signEvent', 'expirable_1h', NOW);
    expect(grantExpiryLabel(grant, NOW + 1800)).toBe('in 30 m');
  });

  it('reports expired grants', () => {
    const grant = makeGrant('signEvent', 'expirable_5m', NOW);
    expect(grantExpiryLabel(grant, NOW + 600)).toBe('expired');
  });
});
