import '@/assets/css/main.css';
import { clearChildren, el } from '@/components/dom';
import {
  CONDITION_LABEL,
  grantExpiryLabel,
  levelLabel,
  truncateMiddle,
} from '@/components/format';
import {
  getStoredTheme,
  initTheme,
  setStoredTheme,
  THEMES,
} from '@/components/theme';
import {
  derivePubkey,
  generateProfileKey,
  parseSecretKeyInput,
  pubkeyToNpub,
  secretKeyToNsec,
  withSecretKey,
} from '@/lib/nostr';
import {
  ACTIVE_PUBKEY_STORAGE_KEY,
  addProfile,
  deleteProfile,
  getActivePubkey,
  listProfiles,
  PROFILES_STORAGE_KEY,
  renameProfile,
  replaceEncryptedKey,
  revokeGrant,
  setActivePubkey,
  setRelays,
  validateRelayUrl,
  type Profile,
} from '@/lib/profiles';
import type { RelayMap } from '@/lib/protocol';
import { UI_TAG, sendUiMessage } from '@/lib/ui-messages';
import {
  changePassphrase,
  decryptSecret,
  encryptSecret,
  getAutolockSeconds,
  isUnlocked,
  setAutolockSeconds,
  VAULT_META_STORAGE_KEY,
  VAULT_SESSION_STORAGE_KEY,
  vaultExists,
} from '@/lib/vault';

const BUTTON =
  'rounded bg-bg-elevated px-2 py-1 text-sm font-medium text-fg hover:bg-bg-highlight';
const PRIMARY_BUTTON =
  'rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover';
const DANGER_BUTTON =
  'rounded bg-error-bg px-2 py-1 text-sm font-medium text-error hover:text-error-hover';
const LINK_BUTTON = 'text-sm text-primary hover:text-primary-hover';
const INPUT =
  'rounded border border-fg-muted bg-bg-muted px-2 py-1 text-sm text-fg';
const SECTION = 'mt-6 rounded-lg bg-bg-subtle p-4';
const HEADING = 'text-base font-semibold text-primary';
const SUBHEADING = 'mt-4 text-sm font-semibold text-fg';

const SECONDS_PER_MINUTE = 60;

function errorLine(): {
  node: HTMLElement;
  show: (message: string) => void;
  clear: () => void;
} {
  const node = el('p', { className: 'mt-2 hidden text-sm text-error' });
  return {
    node,
    show: (message: string) => {
      node.textContent = message;
      node.classList.remove('hidden');
    },
    clear: () => {
      node.classList.add('hidden');
    },
  };
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function copyButton(value: string): HTMLElement {
  const button = el('button', {
    className: LINK_BUTTON,
    text: 'copy',
    attrs: { type: 'button' },
  });
  button.addEventListener('click', () => {
    void navigator.clipboard.writeText(value).then(() => {
      button.textContent = 'copied';
    });
  });
  return button;
}

function themeSection(): HTMLElement {
  const section = el('section', { className: SECTION }, [
    el('h2', { className: HEADING, text: 'Theme' }),
  ]);
  const row = el('div', { className: 'mt-3 flex gap-4' });
  void getStoredTheme().then((current) => {
    for (const theme of THEMES) {
      const radio = el('input', {
        attrs: { type: 'radio', name: 'theme', value: theme },
      });
      radio.checked = theme === current;
      radio.addEventListener('change', () => {
        void setStoredTheme(theme);
      });
      row.append(
        el('label', { className: 'flex items-center gap-2 text-sm text-fg' }, [
          radio,
          theme,
        ]),
      );
    }
  });
  section.append(row);
  return section;
}

function vaultSection(state: {
  exists: boolean;
  unlocked: boolean;
  autolockSeconds: number | null;
  profiles: Record<string, Profile>;
}): HTMLElement {
  const section = el('section', { className: SECTION }, [
    el('h2', { className: HEADING, text: 'Vault' }),
  ]);

  if (!state.exists) {
    section.append(
      el('p', {
        className: 'mt-2 text-sm text-fg-subtle',
        text: 'No vault exists yet. Create one to hold encrypted keys.',
      }),
      el('div', { className: 'mt-3' }, [
        el('button', {
          className: PRIMARY_BUTTON,
          text: 'Create vault',
          attrs: { type: 'button' },
          onClick: () => {
            void browser.tabs.create({
              url: browser.runtime.getURL('/unlock.html'),
            });
          },
        }),
      ]),
    );
    return section;
  }

  const statusRow = el('div', {
    className: 'mt-2 flex items-center justify-between',
  });
  if (state.unlocked) {
    statusRow.append(
      el('span', { className: 'text-sm text-accent', text: 'Unlocked' }),
      el('button', {
        className: BUTTON,
        text: 'Lock now',
        attrs: { type: 'button' },
        onClick: () => {
          void sendUiMessage({ ui: UI_TAG, action: 'lock' });
        },
      }),
    );
  } else {
    statusRow.append(
      el('span', { className: 'text-sm text-warning', text: 'Locked' }),
      el('button', {
        className: BUTTON,
        text: 'Unlock',
        attrs: { type: 'button' },
        onClick: () => {
          void browser.tabs.create({
            url: browser.runtime.getURL('/unlock.html'),
          });
        },
      }),
    );
  }
  section.append(statusRow);

  const autolockError = errorLine();
  const autolockInput = el('input', {
    className: `${INPUT} w-20`,
    attrs: { type: 'text', 'aria-label': 'auto-lock minutes' },
  });
  if (state.autolockSeconds !== null) {
    autolockInput.value = String(
      Math.floor(state.autolockSeconds / SECONDS_PER_MINUTE),
    );
  }
  section.append(
    el('h3', { className: SUBHEADING, text: 'Auto-lock timeout (minutes)' }),
    el('div', { className: 'mt-2 flex items-center gap-2' }, [
      autolockInput,
      el('button', {
        className: BUTTON,
        text: 'Save',
        attrs: { type: 'button' },
        onClick: () => {
          autolockError.clear();
          const minutes = Number.parseInt(autolockInput.value, 10);
          void setAutolockSeconds(minutes * SECONDS_PER_MINUTE).catch(
            (error: unknown) => {
              autolockError.show(asMessage(error));
            },
          );
        },
      }),
    ]),
    autolockError.node,
  );

  const changeError = errorLine();
  const currentInput = el('input', {
    className: `${INPUT} mt-1 w-full`,
    attrs: { type: 'password', autocomplete: 'off' },
  });
  const nextInput = el('input', {
    className: `${INPUT} mt-1 w-full`,
    attrs: { type: 'password', autocomplete: 'off' },
  });
  const confirmInput = el('input', {
    className: `${INPUT} mt-1 w-full`,
    attrs: { type: 'password', autocomplete: 'off' },
  });
  const changeForm = el('form', { className: 'mt-2 max-w-sm' }, [
    el(
      'label',
      {
        className: 'block text-sm text-fg-subtle',
        text: 'Current passphrase',
      },
      [currentInput],
    ),
    el(
      'label',
      {
        className: 'mt-2 block text-sm text-fg-subtle',
        text: 'New passphrase',
      },
      [nextInput],
    ),
    el(
      'label',
      {
        className: 'mt-2 block text-sm text-fg-subtle',
        text: 'Confirm new passphrase',
      },
      [confirmInput],
    ),
    el('div', { className: 'mt-3' }, [
      el('button', {
        className: PRIMARY_BUTTON,
        text: 'Change passphrase',
        attrs: { type: 'submit' },
      }),
    ]),
    changeError.node,
  ]);
  changeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    changeError.clear();
    if (nextInput.value === '') {
      changeError.show('new passphrase must not be empty');
      return;
    }
    if (nextInput.value !== confirmInput.value) {
      changeError.show('new passphrases do not match');
      return;
    }
    const entries = Object.entries(state.profiles);
    void changePassphrase(
      currentInput.value,
      nextInput.value,
      entries.map(([, profile]) => profile.encryptedKey),
    )
      .then(async (rewrapped) => {
        for (const [index, [pubkey]] of entries.entries()) {
          const blob = rewrapped[index];
          if (blob === undefined) {
            throw new Error(`missing rewrapped key for ${pubkey}`);
          }
          await replaceEncryptedKey(pubkey, blob);
        }
      })
      .catch((error: unknown) => {
        changeError.show(asMessage(error));
      });
  });
  section.append(
    el('h3', { className: SUBHEADING, text: 'Change passphrase' }),
    changeForm,
  );

  return section;
}

function relayEditor(pubkey: string, profile: Profile): HTMLElement {
  const error = errorLine();
  const container = el('div', {}, [
    el('h4', { className: SUBHEADING, text: 'Relays (wss:// only)' }),
  ]);

  const saveRelays = (produce: (relays: RelayMap) => RelayMap): void => {
    error.clear();
    let next: RelayMap;
    try {
      next = produce({ ...profile.relays });
    } catch (produceError) {
      error.show(asMessage(produceError));
      return;
    }
    void setRelays(pubkey, next).catch((saveError: unknown) => {
      error.show(asMessage(saveError));
    });
  };

  for (const [url, policy] of Object.entries(profile.relays)) {
    const readBox = el('input', { attrs: { type: 'checkbox' } });
    readBox.checked = policy.read;
    readBox.addEventListener('change', () => {
      saveRelays((relays) => ({
        ...relays,
        [url]: { read: readBox.checked, write: policy.write },
      }));
    });
    const writeBox = el('input', { attrs: { type: 'checkbox' } });
    writeBox.checked = policy.write;
    writeBox.addEventListener('change', () => {
      saveRelays((relays) => ({
        ...relays,
        [url]: { read: policy.read, write: writeBox.checked },
      }));
    });
    container.append(
      el('div', { className: 'mt-2 flex items-center gap-3' }, [
        el('span', {
          className: 'font-mono text-xs text-fg',
          text: url,
        }),
        el(
          'label',
          {
            className: 'flex items-center gap-1 text-xs text-fg-subtle',
          },
          [readBox, 'read'],
        ),
        el(
          'label',
          {
            className: 'flex items-center gap-1 text-xs text-fg-subtle',
          },
          [writeBox, 'write'],
        ),
        el('button', {
          className: DANGER_BUTTON,
          text: 'Remove',
          attrs: { type: 'button' },
          onClick: () => {
            saveRelays((relays) =>
              Object.fromEntries(
                Object.entries(relays).filter(([key]) => key !== url),
              ),
            );
          },
        }),
      ]),
    );
  }

  const addInput = el('input', {
    className: `${INPUT} w-72`,
    attrs: { type: 'text', placeholder: 'wss://relay.example/' },
  });
  container.append(
    el('div', { className: 'mt-2 flex items-center gap-2' }, [
      addInput,
      el('button', {
        className: BUTTON,
        text: 'Add relay',
        attrs: { type: 'button' },
        onClick: () => {
          saveRelays((relays) => ({
            ...relays,
            [validateRelayUrl(addInput.value.trim())]: {
              read: true,
              write: true,
            },
          }));
        },
      }),
    ]),
    error.node,
  );
  return container;
}

function permissionTable(pubkey: string, profile: Profile): HTMLElement {
  const container = el('div', {}, [
    el('h4', { className: SUBHEADING, text: 'Permissions' }),
  ]);
  const hosts = Object.entries(profile.permissions);
  if (hosts.length === 0) {
    container.append(
      el('p', {
        className: 'mt-2 text-sm text-fg-subtle',
        text: 'No grants recorded.',
      }),
    );
    return container;
  }
  const now = nowSeconds();
  for (const [host, grant] of hosts) {
    container.append(
      el('div', { className: 'mt-2 flex items-center gap-3 text-sm' }, [
        el('span', { className: 'font-semibold text-fg', text: host }),
        el('span', {
          className: 'text-fg-subtle',
          text: `${CONDITION_LABEL[grant.condition]}, expires ${grantExpiryLabel(grant, now)}`,
          attrs: { title: `may ${levelLabel(grant.level)}` },
        }),
        el('button', {
          className: DANGER_BUTTON,
          text: 'Revoke',
          attrs: { type: 'button' },
          onClick: () => {
            void revokeGrant(pubkey, host).catch((revokeError: unknown) => {
              console.error('autograph: revoke failed', revokeError);
            });
          },
        }),
      ]),
    );
  }
  return container;
}

function profileCard(
  pubkey: string,
  profile: Profile,
  activePubkey: string | null,
): HTMLElement {
  const error = errorLine();
  const npub = pubkeyToNpub(pubkey);
  const isActive = pubkey === activePubkey;

  const nameInput = el('input', {
    className: `${INPUT} w-48`,
    attrs: { type: 'text', 'aria-label': 'profile name' },
  });
  nameInput.value = profile.name;

  const header = el('div', { className: 'flex flex-wrap items-center gap-2' }, [
    nameInput,
    el('button', {
      className: BUTTON,
      text: 'Rename',
      attrs: { type: 'button' },
      onClick: () => {
        error.clear();
        if (nameInput.value.trim() === '') {
          error.show('profile name must not be empty');
          return;
        }
        void renameProfile(pubkey, nameInput.value.trim()).catch(
          (renameError: unknown) => {
            error.show(asMessage(renameError));
          },
        );
      },
    }),
    isActive
      ? el('span', { className: 'text-sm text-accent', text: 'active' })
      : el('button', {
          className: BUTTON,
          text: 'Make active',
          attrs: { type: 'button' },
          onClick: () => {
            void setActivePubkey(pubkey).catch((activeError: unknown) => {
              console.error('autograph: profile switch failed', activeError);
            });
          },
        }),
    el('button', {
      className: DANGER_BUTTON,
      text: 'Delete',
      attrs: { type: 'button' },
      onClick: () => {
        if (
          !window.confirm(
            `Delete profile "${profile.name}" (${truncateMiddle(npub)})? The key is unrecoverable unless exported.`,
          )
        ) {
          return;
        }
        void deleteProfile(pubkey).catch((deleteError: unknown) => {
          error.show(asMessage(deleteError));
        });
      },
    }),
  ]);

  const npubRow = el('p', { className: 'mt-2 flex items-center gap-2' }, [
    el('span', {
      className: 'font-mono text-xs text-fg-subtle',
      text: truncateMiddle(npub),
      attrs: { title: npub },
    }),
    copyButton(npub),
  ]);

  const nsecRow = el('div', { className: 'mt-2' });
  const revealButton = el('button', {
    className: BUTTON,
    text: 'Reveal nsec',
    attrs: { type: 'button' },
  });
  revealButton.addEventListener('click', () => {
    error.clear();
    void decryptSecret(profile.encryptedKey)
      .then(async (secretKey) => {
        const nsec = await withSecretKey(secretKey, (sk) =>
          secretKeyToNsec(sk),
        );
        const nsecInput = el('input', {
          className: `${INPUT} w-full font-mono`,
          attrs: { type: 'text', readonly: 'readonly' },
        });
        nsecInput.value = nsec;
        nsecRow.replaceChildren(
          el('div', { className: 'flex items-center gap-2' }, [
            nsecInput,
            el('button', {
              className: BUTTON,
              text: 'Hide',
              attrs: { type: 'button' },
              onClick: () => {
                nsecRow.replaceChildren(revealButton);
              },
            }),
          ]),
        );
      })
      .catch((revealError: unknown) => {
        error.show(asMessage(revealError));
      });
  });
  nsecRow.append(revealButton);

  return el('div', { className: 'mt-4 rounded bg-bg p-3' }, [
    header,
    npubRow,
    nsecRow,
    relayEditor(pubkey, profile),
    permissionTable(pubkey, profile),
    error.node,
  ]);
}

function addProfileForms(unlocked: boolean): HTMLElement {
  const container = el('div', {}, [
    el('h3', { className: SUBHEADING, text: 'Add profile' }),
  ]);
  if (!unlocked) {
    container.append(
      el('p', {
        className: 'mt-2 text-sm text-fg-subtle',
        text: 'Unlock the vault to add profiles.',
      }),
    );
    return container;
  }

  const error = errorLine();

  const generateName = el('input', {
    className: `${INPUT} w-48`,
    attrs: { type: 'text', placeholder: 'profile name' },
  });
  container.append(
    el('div', { className: 'mt-2 flex items-center gap-2' }, [
      generateName,
      el('button', {
        className: PRIMARY_BUTTON,
        text: 'Generate new key',
        attrs: { type: 'button' },
        onClick: () => {
          error.clear();
          const name = generateName.value.trim();
          if (name === '') {
            error.show('profile name must not be empty');
            return;
          }
          const { secretKey, pubkey } = generateProfileKey();
          void withSecretKey(secretKey, (sk) => encryptSecret(sk))
            .then((encryptedKey) => addProfile(pubkey, name, encryptedKey))
            .catch((generateError: unknown) => {
              error.show(asMessage(generateError));
            });
        },
      }),
    ]),
  );

  const importName = el('input', {
    className: `${INPUT} w-48`,
    attrs: { type: 'text', placeholder: 'profile name' },
  });
  const importSecret = el('input', {
    className: `${INPUT} w-72 font-mono`,
    attrs: { type: 'password', placeholder: 'nsec1… or 64-char hex' },
  });
  container.append(
    el('div', { className: 'mt-2 flex flex-wrap items-center gap-2' }, [
      importName,
      importSecret,
      el('button', {
        className: PRIMARY_BUTTON,
        text: 'Import key',
        attrs: { type: 'button' },
        onClick: () => {
          error.clear();
          const name = importName.value.trim();
          if (name === '') {
            error.show('profile name must not be empty');
            return;
          }
          try {
            const secretKey = parseSecretKeyInput(importSecret.value);
            const pubkey = derivePubkey(secretKey);
            void withSecretKey(secretKey, (sk) => encryptSecret(sk))
              .then(async (encryptedKey) => {
                await addProfile(pubkey, name, encryptedKey);
                importSecret.value = '';
              })
              .catch((importError: unknown) => {
                error.show(asMessage(importError));
              });
          } catch (parseError) {
            error.show(asMessage(parseError));
          }
        },
      }),
    ]),
    error.node,
  );
  return container;
}

function profilesSection(state: {
  unlocked: boolean;
  activePubkey: string | null;
  profiles: Record<string, Profile>;
}): HTMLElement {
  const section = el('section', { className: SECTION }, [
    el('h2', { className: HEADING, text: 'Profiles' }),
  ]);
  const entries = Object.entries(state.profiles);
  if (entries.length === 0) {
    section.append(
      el('p', {
        className: 'mt-2 text-sm text-fg-subtle',
        text: 'No profiles yet.',
      }),
    );
  }
  for (const [pubkey, profile] of entries) {
    section.append(profileCard(pubkey, profile, state.activePubkey));
  }
  section.append(addProfileForms(state.unlocked));
  return section;
}

async function render(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app === null) {
    throw new Error('options root element #app not found');
  }
  const [exists, unlocked, activePubkey, profiles] = await Promise.all([
    vaultExists(),
    isUnlocked(),
    getActivePubkey(),
    listProfiles(),
  ]);
  const autolockSeconds = exists ? await getAutolockSeconds() : null;

  clearChildren(app);
  app.append(
    el(
      'main',
      { className: 'mx-auto min-h-screen max-w-2xl bg-bg p-6 text-fg' },
      [
        el('h1', {
          className: 'text-xl font-bold text-primary',
          text: 'autograph options',
        }),
        vaultSection({ exists, unlocked, autolockSeconds, profiles }),
        profilesSection({ unlocked, activePubkey, profiles }),
        themeSection(),
      ],
    ),
  );
}

// The page renders entirely from these keys, so any change to them — a grant
// stored by the background, a lock/unlock, a mutation from another page —
// re-renders without a manual refresh. Renders are chained so an event
// arriving mid-render cannot interleave two rebuilds.
const WATCHED_LOCAL_KEYS: readonly string[] = [
  PROFILES_STORAGE_KEY,
  ACTIVE_PUBKEY_STORAGE_KEY,
  VAULT_META_STORAGE_KEY,
];

let renderChain: Promise<void> = Promise.resolve();

function scheduleRender(): void {
  renderChain = renderChain
    .then(() => render())
    .catch((error: unknown) => {
      console.error('autograph: options render failed', error);
    });
}

function watchRenderSources(): void {
  browser.storage.onChanged.addListener((changes, area) => {
    const keys = Object.keys(changes);
    const relevant =
      (area === 'local' &&
        keys.some((key) => WATCHED_LOCAL_KEYS.includes(key))) ||
      (area === 'session' && keys.includes(VAULT_SESSION_STORAGE_KEY));
    if (relevant) {
      scheduleRender();
    }
  });
}

async function main(): Promise<void> {
  await initTheme();
  await render();
  watchRenderSources();
}

void main();
