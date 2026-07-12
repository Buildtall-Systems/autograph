import '@/assets/css/main.css';
import { clearChildren, el } from '@/components/dom';
import { initTheme } from '@/components/theme';
import { UI_TAG, sendUiMessage } from '@/lib/ui-messages';
import { vaultExists } from '@/lib/vault';

const BUTTON =
  'rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover';
const INPUT =
  'mt-1 w-full rounded border border-fg-muted bg-bg-muted px-2 py-1.5 text-sm text-fg';
const LABEL = 'mt-3 block text-sm text-fg-subtle';

function passphraseField(labelText: string): {
  label: HTMLLabelElement;
  input: HTMLInputElement;
} {
  const input = el('input', {
    className: INPUT,
    attrs: { type: 'password', autocomplete: 'off' },
  });
  const label = el('label', { className: LABEL, text: labelText }, [input]);
  return { label, input };
}

function renderDone(app: HTMLElement, message: string): void {
  clearChildren(app);
  app.append(
    el('main', { className: 'min-h-screen bg-bg p-4 text-fg' }, [
      el('h1', {
        className: 'text-lg font-bold text-primary',
        text: 'autograph',
      }),
      el('p', { className: 'mt-3 text-sm text-fg', text: message }),
    ]),
  );
  window.close();
}

function renderForm(app: HTMLElement, createMode: boolean): void {
  clearChildren(app);
  const error = el('p', { className: 'mt-3 hidden text-sm text-error' });
  const showError = (message: string): void => {
    error.textContent = message;
    error.classList.remove('hidden');
  };

  const passphrase = passphraseField(
    createMode ? 'Choose a vault passphrase' : 'Vault passphrase',
  );
  const form = el('form', {}, [passphrase.label]);

  let confirmInput: HTMLInputElement | null = null;
  if (createMode) {
    const confirm = passphraseField('Confirm passphrase');
    confirmInput = confirm.input;
    form.append(confirm.label);
  }

  form.append(
    el('div', { className: 'mt-4' }, [
      el('button', {
        className: BUTTON,
        text: createMode ? 'Create vault' : 'Unlock',
        attrs: { type: 'submit' },
      }),
    ]),
    error,
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = passphrase.input.value;
    if (value === '') {
      showError('passphrase must not be empty');
      return;
    }
    if (confirmInput !== null && confirmInput.value !== value) {
      showError('passphrases do not match');
      return;
    }
    void sendUiMessage({
      ui: UI_TAG,
      action: createMode ? 'createVault' : 'unlock',
      passphrase: value,
    }).then((result) => {
      if (result.error !== undefined) {
        showError(result.error);
        return;
      }
      renderDone(app, createMode ? 'Vault created and unlocked.' : 'Unlocked.');
    });
  });

  app.append(
    el('main', { className: 'min-h-screen bg-bg p-4 text-fg' }, [
      el('h1', {
        className: 'text-lg font-bold text-primary',
        text: 'autograph',
      }),
      el('p', {
        className: 'mt-2 text-sm text-fg-subtle',
        text: createMode
          ? 'No vault exists yet. Your keys are encrypted at rest behind this passphrase.'
          : 'The vault is locked. Enter your passphrase to continue.',
      }),
      form,
    ]),
  );
  passphrase.input.focus();
}

async function main(): Promise<void> {
  await initTheme();
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app === null) {
    throw new Error('unlock root element #app not found');
  }
  renderForm(app, !(await vaultExists()));
}

void main();
