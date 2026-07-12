// Distribution constants — the single source for the addon identity and
// hosting URLs shared by wxt.config.ts, the updates.json generator, and tests.

export const ADDON_ID = 'autograph@buildtall.systems';
export const GECKO_STRICT_MIN_VERSION = '128.0';
export const DIST_BASE_URL = 'https://buildtall.systems/autograph';
export const UPDATES_URL = `${DIST_BASE_URL}/updates.json`;

export function xpiUrl(version: string): string {
  return `${DIST_BASE_URL}/autograph-${version}.xpi`;
}

export interface UpdateEntry {
  version: string;
  update_link: string;
  applications: {
    gecko: { strict_min_version: string };
  };
}

export interface UpdatesManifest {
  addons: Record<string, { updates: UpdateEntry[] }>;
}

// Mozilla update manifest for self-distributed add-ons:
// https://extensionworkshop.com/documentation/manage/updating-your-extension
export function buildUpdatesManifest(version: string): UpdatesManifest {
  return {
    addons: {
      [ADDON_ID]: {
        updates: [
          {
            version,
            update_link: xpiUrl(version),
            applications: {
              gecko: { strict_min_version: GECKO_STRICT_MIN_VERSION },
            },
          },
        ],
      },
    },
  };
}
