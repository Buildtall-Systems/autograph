import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';
import {
  ADDON_ID,
  CHANNEL_ENV_VAR,
  GECKO_STRICT_MIN_VERSION,
  HOMEPAGE_URL,
  parseChannel,
  UPDATES_URL,
  unlistedVersion,
} from './lib/dist';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  imports: {
    eslintrc: {
      enabled: 9,
    },
  },
  // The listed (AMO-hosted) channel must not carry update_url and takes the
  // canonical version; the unlisted self-hosted channel keeps update_url and
  // appends the fourth version segment. Chromium ignores the channel.
  manifest: ({ browser }) => {
    const channel = parseChannel(process.env[CHANNEL_ENV_VAR]);
    return {
      homepage_url: HOMEPAGE_URL,
      permissions: ['storage', 'clipboardWrite'],
      web_accessible_resources: [
        {
          resources: ['nostr-provider.js'],
          matches: ['*://*/*'],
        },
      ],
      ...(browser === 'firefox'
        ? {
            ...(channel === 'unlisted'
              ? { version: unlistedVersion(pkg.version) }
              : {}),
            browser_specific_settings: {
              gecko: {
                id: ADDON_ID,
                strict_min_version: GECKO_STRICT_MIN_VERSION,
                ...(channel === 'unlisted' ? { update_url: UPDATES_URL } : {}),
              },
            },
          }
        : {}),
    };
  },
});
