import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  imports: {
    eslintrc: {
      enabled: 9,
    },
  },
  manifest: {
    name: 'autograph',
    description:
      'NIP-07 signer for sovereign identity: sign Nostr events without your keys ever leaving the extension.',
    permissions: ['storage', 'clipboardWrite'],
    web_accessible_resources: [
      {
        resources: ['nostr-provider.js'],
        matches: ['*://*/*'],
      },
    ],
  },
});
