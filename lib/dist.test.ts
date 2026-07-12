import { describe, expect, it } from 'vitest';
import {
  ADDON_ID,
  buildUpdatesManifest,
  DIST_BASE_URL,
  GECKO_STRICT_MIN_VERSION,
  UPDATES_URL,
  xpiUrl,
} from './dist';

describe('buildUpdatesManifest', () => {
  it('keys a single update entry by the addon id', () => {
    const manifest = buildUpdatesManifest('0.2.0');
    expect(Object.keys(manifest.addons)).toEqual([ADDON_ID]);
    expect(manifest.addons[ADDON_ID]?.updates).toHaveLength(1);
  });

  it('carries the version and the versioned xpi link', () => {
    const entry = buildUpdatesManifest('1.4.7').addons[ADDON_ID]?.updates[0];
    expect(entry?.version).toBe('1.4.7');
    expect(entry?.update_link).toBe(`${DIST_BASE_URL}/autograph-1.4.7.xpi`);
  });

  it('pins gecko strict_min_version', () => {
    const entry = buildUpdatesManifest('0.2.0').addons[ADDON_ID]?.updates[0];
    expect(entry?.applications.gecko.strict_min_version).toBe(
      GECKO_STRICT_MIN_VERSION,
    );
  });

  it('serves update_link and updates.json from the same https base', () => {
    expect(UPDATES_URL).toBe(`${DIST_BASE_URL}/updates.json`);
    expect(xpiUrl('0.2.0').startsWith('https://')).toBe(true);
    expect(UPDATES_URL.startsWith('https://')).toBe(true);
  });
});
