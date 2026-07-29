import '@/assets/css/main.css';
import { clearChildren, el } from '@/components/dom';
import { truncateMiddle } from '@/components/format';
import { initTheme } from '@/components/theme';
import { pubkeyToNpub } from '@/lib/nostr';
import { getActivePubkey, listProfiles, setActivePubkey } from '@/lib/profiles';
import { HOMEPAGE_URL } from '@/lib/dist';
import { UI_TAG, sendUiMessage } from '@/lib/ui-messages';
import { isUnlocked, vaultExists } from '@/lib/vault';

// Coarse-pointer variants enlarge tap targets to the 44px guideline on
// touchscreens. They key off input accuracy rather than viewport width, so the
// desktop popup, whose panel is narrower than any breakpoint, is unaffected.
const BUTTON =
  'rounded bg-bg-elevated px-2 py-1 text-sm font-medium text-fg hover:bg-bg-highlight ' +
  'pointer-coarse:px-4 pointer-coarse:py-2.5 pointer-coarse:text-base';
const LINK_BUTTON =
  'text-sm text-primary hover:text-primary-hover ' +
  'pointer-coarse:inline-block pointer-coarse:py-2.5 pointer-coarse:text-base';

function openUnlockPage(): void {
  void browser.tabs.create({ url: browser.runtime.getURL('/unlock.html') });
  window.close();
}

// openOptionsPage is absent or unreliable on Firefox for Android; the options
// page already declares open_in_tab, so a tab is the same destination.
async function openOptionsPage(): Promise<void> {
  const runtime: { openOptionsPage?: unknown } = browser.runtime;
  if (runtime.openOptionsPage !== undefined) {
    try {
      await browser.runtime.openOptionsPage();
      return;
    } catch (error) {
      console.warn('autograph: openOptionsPage failed', error);
    }
  }
  await browser.tabs.create({ url: browser.runtime.getURL('/options.html') });
}

function vaultSection(exists: boolean, unlocked: boolean): HTMLElement {
  const section = el('section', {
    className: 'mt-3 flex items-center justify-between',
  });
  if (!exists) {
    section.append(
      el('span', { className: 'text-sm text-fg-subtle', text: 'No vault yet' }),
      el('button', {
        className: BUTTON,
        text: 'Create vault',
        attrs: { type: 'button' },
        onClick: openUnlockPage,
      }),
    );
    return section;
  }
  if (unlocked) {
    section.append(
      el('span', { className: 'text-sm text-accent', text: 'Vault unlocked' }),
      el('button', {
        className: BUTTON,
        text: 'Lock now',
        attrs: { type: 'button' },
        onClick: () => {
          void sendUiMessage({ ui: UI_TAG, action: 'lock' }).then(() => {
            void render();
          });
        },
      }),
    );
    return section;
  }
  section.append(
    el('span', { className: 'text-sm text-warning', text: 'Vault locked' }),
    el('button', {
      className: BUTTON,
      text: 'Unlock',
      attrs: { type: 'button' },
      onClick: openUnlockPage,
    }),
  );
  return section;
}

function copyButton(npub: string): HTMLElement {
  const button = el('button', {
    className: LINK_BUTTON,
    text: 'copy',
    attrs: { type: 'button' },
  });
  button.addEventListener('click', () => {
    void navigator.clipboard.writeText(npub).then(() => {
      button.textContent = 'copied';
    });
  });
  return button;
}

async function render(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app === null) {
    throw new Error('popup root element #app not found');
  }
  const [exists, unlocked, activePubkey, profiles] = await Promise.all([
    vaultExists(),
    isUnlocked(),
    getActivePubkey(),
    listProfiles(),
  ]);

  clearChildren(app);
  const page = el(
    'main',
    {
      className: 'min-w-80 bg-bg p-4 text-fg pointer-coarse:w-full',
    },
    [
      el('h1', {
        className: 'text-lg font-bold text-primary',
        text: 'autograph',
      }),
      vaultSection(exists, unlocked),
    ],
  );

  const active = activePubkey === null ? undefined : profiles[activePubkey];
  if (activePubkey !== null && active !== undefined) {
    const npub = pubkeyToNpub(activePubkey);
    page.append(
      el('section', { className: 'mt-3' }, [
        el('p', {
          className: 'text-sm font-semibold text-fg',
          text: active.name,
        }),
        el('p', { className: 'mt-1 flex items-center gap-2' }, [
          el('span', {
            className: 'font-mono text-xs text-fg-subtle',
            text: truncateMiddle(npub),
            attrs: { title: npub },
          }),
          copyButton(npub),
        ]),
      ]),
    );
  } else {
    page.append(
      el('p', {
        className: 'mt-3 text-sm text-fg-subtle',
        text: 'No active profile — create one in options.',
      }),
    );
  }

  const pubkeys = Object.keys(profiles);
  if (pubkeys.length > 1) {
    const select = el('select', {
      className:
        'mt-1 w-full rounded border border-fg-muted bg-bg-muted px-2 py-1 text-sm text-fg ' +
        'pointer-coarse:px-3 pointer-coarse:py-2.5 pointer-coarse:text-base',
      attrs: { 'aria-label': 'active profile' },
    });
    for (const pubkey of pubkeys) {
      const profile = profiles[pubkey];
      if (profile === undefined) {
        continue;
      }
      const option = el('option', {
        text: `${profile.name} (${truncateMiddle(pubkeyToNpub(pubkey))})`,
        attrs: { value: pubkey },
      });
      option.selected = pubkey === activePubkey;
      select.append(option);
    }
    select.addEventListener('change', () => {
      void setActivePubkey(select.value).then(() => render());
    });
    page.append(
      el('section', { className: 'mt-3' }, [
        el('label', {
          className: 'block text-sm text-fg-subtle',
          text: 'Switch profile',
        }),
        select,
      ]),
    );
  }

  page.append(
    el('div', { className: 'mt-4 flex items-center justify-between' }, [
      el('button', {
        className: LINK_BUTTON,
        text: 'Options',
        attrs: { type: 'button' },
        onClick: () => {
          void openOptionsPage().finally(() => {
            window.close();
          });
        },
      }),
      el('a', {
        className: LINK_BUTTON,
        text: 'buildtall.systems',
        attrs: { href: HOMEPAGE_URL, target: '_blank', rel: 'noreferrer' },
      }),
    ]),
  );
  app.append(page);
}

async function main(): Promise<void> {
  await initTheme();
  await render();
}

void main();
