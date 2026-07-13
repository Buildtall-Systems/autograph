import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';
import {
  ADDON_ID,
  GECKO_STRICT_MIN_VERSION,
  HOMEPAGE_URL,
  UPDATES_URL,
} from './lib/dist';

export default defineConfig({
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  imports: {
    eslintrc: {
      enabled: 9,
    },
  },
  manifest: ({ browser }) => ({
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
          browser_specific_settings: {
            gecko: {
              id: ADDON_ID,
              strict_min_version: GECKO_STRICT_MIN_VERSION,
              update_url: UPDATES_URL,
            },
          },
        }
      : {}),
  }),
});
