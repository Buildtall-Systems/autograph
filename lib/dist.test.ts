import { describe, expect, it } from 'vitest';
import {
  DIST_BASE_URL,
  parseChannel,
  UNLISTED_VERSION_SEGMENT,
  UPDATES_URL,
  unlistedVersion,
} from './dist';

describe('parseChannel', () => {
  it('defaults to unlisted when the variable is unset or empty', () => {
    expect(parseChannel(undefined)).toBe('unlisted');
    expect(parseChannel('')).toBe('unlisted');
  });

  it('accepts the two channel values', () => {
    expect(parseChannel('listed')).toBe('listed');
    expect(parseChannel('unlisted')).toBe('unlisted');
  });

  it('rejects anything else', () => {
    expect(() => parseChannel('public')).toThrow(/listed/);
    expect(() => parseChannel('LISTED')).toThrow(/LISTED/);
  });
});

describe('unlistedVersion', () => {
  it('appends the fourth segment to a canonical version', () => {
    expect(unlistedVersion('0.2.0')).toBe(`0.2.0.${UNLISTED_VERSION_SEGMENT}`);
    expect(unlistedVersion('12.34.56')).toBe(
      `12.34.56.${UNLISTED_VERSION_SEGMENT}`,
    );
  });

  it('rejects versions that are not three-part canonical', () => {
    expect(() => unlistedVersion('0.2')).toThrow(/three-part/);
    expect(() => unlistedVersion('0.2.0.1')).toThrow(/three-part/);
    expect(() => unlistedVersion('0.2.0-alpha1')).toThrow(/three-part/);
  });
});

describe('distribution URLs', () => {
  it('serves updates.json from the https dist base', () => {
    expect(UPDATES_URL).toBe(`${DIST_BASE_URL}/updates.json`);
    expect(UPDATES_URL.startsWith('https://')).toBe(true);
  });
});
