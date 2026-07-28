// Distribution constants: the single source for the addon identity, hosting
// URLs, and channel semantics shared by wxt.config.ts and tests.

export const ADDON_ID = 'autograph@buildtall.systems';
export const GECKO_STRICT_MIN_VERSION = '128.0';
export const HOMEPAGE_URL = 'https://buildtall.systems';
export const DIST_BASE_URL = `${HOMEPAGE_URL}/autograph`;
export const UPDATES_URL = `${DIST_BASE_URL}/updates.json`;

// AMO consumes version numbers per add-on across channels, so the unlisted
// self-hosted signing appends a fourth segment to the canonical version.
export type Channel = 'listed' | 'unlisted';

export const CHANNEL_ENV_VAR = 'AUTOGRAPH_CHANNEL';
export const UNLISTED_VERSION_SEGMENT = '1';

export function parseChannel(raw: string | undefined): Channel {
  if (raw === undefined || raw === '') return 'unlisted';
  if (raw === 'listed' || raw === 'unlisted') return raw;
  throw new Error(
    `${CHANNEL_ENV_VAR} must be "listed" or "unlisted", got "${raw}"`,
  );
}

export function unlistedVersion(canonical: string): string {
  if (!/^\d+\.\d+\.\d+$/.test(canonical)) {
    throw new Error(
      `expected a three-part canonical version, got "${canonical}"`,
    );
  }
  return `${canonical}.${UNLISTED_VERSION_SEGMENT}`;
}
