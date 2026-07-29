import '@/assets/css/main.css';
import { clearChildren, el } from '@/components/dom';
import { CAPABILITY_LABEL, parseDurationInput } from '@/components/format';
import { initTheme } from '@/components/theme';
import type { GrantCondition } from '@/lib/permissions';
import {
  listQueuedPrompts,
  watchPromptQueue,
  type QueuedPrompt,
} from '@/lib/prompts';
import { UI_TAG, sendUiMessage } from '@/lib/ui-messages';

// Coarse-pointer variants enlarge tap targets to the 44px guideline on
// touchscreens; desktop rendering is untouched. Mis-taps here grant or deny
// capabilities, so the grant and deny targets are separated as well as sized.
const GRANT_BUTTON =
  'rounded bg-bg-elevated px-2 py-1 text-sm font-medium text-fg hover:bg-bg-highlight ' +
  'pointer-coarse:px-4 pointer-coarse:py-2.5 pointer-coarse:text-base';
const DENY_BUTTON =
  'rounded bg-error-bg px-2 py-1 text-sm font-medium text-error hover:text-error-hover ' +
  'pointer-coarse:px-4 pointer-coarse:py-2.5 pointer-coarse:text-base';
const INPUT =
  'rounded border border-fg-muted bg-bg-muted px-2 py-1 text-sm text-fg ' +
  'pointer-coarse:w-full pointer-coarse:px-3 pointer-coarse:py-2.5 pointer-coarse:text-base';

const CONDITION_CHOICES: { label: string; condition: GrantCondition }[] = [
  { label: 'Once', condition: 'single' },
  { label: '5 min', condition: 'expirable_5m' },
  { label: '1 hour', condition: 'expirable_1h' },
  { label: '8 hours', condition: 'expirable_8h' },
  { label: 'Forever', condition: 'forever' },
];

function promptCard(prompt: QueuedPrompt): HTMLElement {
  const error = el('p', { className: 'mt-2 hidden text-sm text-error' });
  const showError = (message: string): void => {
    error.textContent = message;
    error.classList.remove('hidden');
  };
  const respond = (
    condition: GrantCondition,
    durationSeconds?: number,
  ): void => {
    void sendUiMessage({
      ui: UI_TAG,
      action: 'answerPrompt',
      id: prompt.id,
      condition,
      durationSeconds,
    }).then((result) => {
      if (result.error !== undefined) {
        showError(result.error);
      }
    });
  };

  const header = el('p', {}, [
    el('span', { className: 'font-semibold text-primary', text: prompt.host }),
    el('span', {
      className: 'text-fg',
      text: ` wants to ${CAPABILITY_LABEL[prompt.capability]}`,
    }),
  ]);

  const card = el('section', { className: 'rounded-lg bg-bg-subtle p-4' }, [
    header,
  ]);

  if (prompt.detail !== undefined) {
    card.append(
      el('p', {
        className: 'mt-2 text-sm text-fg-subtle',
        text: `event kind ${String(prompt.detail.kind)}`,
      }),
      el('pre', {
        className:
          'mt-1 overflow-hidden whitespace-pre-wrap break-words rounded bg-bg-muted p-2 font-mono text-xs text-fg-subtle',
        text: prompt.detail.contentPreview,
      }),
    );
  }

  const buttons = el('div', {
    className: 'mt-3 flex flex-wrap gap-2 pointer-coarse:gap-3',
  });
  for (const choice of CONDITION_CHOICES) {
    buttons.append(
      el('button', {
        className: GRANT_BUTTON,
        text: choice.label,
        attrs: { type: 'button' },
        onClick: () => {
          respond(choice.condition);
        },
      }),
    );
  }

  const customInput = el('input', {
    className: `${INPUT} w-20`,
    attrs: {
      type: 'text',
      placeholder: '90m',
      'aria-label': 'custom duration',
    },
  });
  const customRow = el(
    'div',
    {
      className:
        'mt-2 flex items-center gap-2 pointer-coarse:flex-wrap pointer-coarse:gap-3',
    },
    [
      customInput,
      el('button', {
        className: GRANT_BUTTON,
        text: 'Grant custom',
        attrs: { type: 'button' },
        onClick: () => {
          try {
            respond('expirable_custom', parseDurationInput(customInput.value));
          } catch (parseError) {
            showError(
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
            );
          }
        },
      }),
      el('button', {
        className: DENY_BUTTON,
        text: 'Deny',
        attrs: { type: 'button' },
        onClick: () => {
          respond('no');
        },
      }),
    ],
  );

  card.append(buttons, customRow, error);
  return card;
}

function render(app: HTMLElement, queue: QueuedPrompt[]): void {
  clearChildren(app);
  const page = el('main', { className: 'min-h-screen bg-bg p-4 text-fg' }, [
    el('h1', {
      className: 'text-lg font-bold text-primary',
      text: 'autograph',
    }),
  ]);
  if (queue.length === 0) {
    page.append(
      el('p', {
        className: 'mt-3 text-sm text-fg-subtle',
        text: 'No pending requests.',
      }),
    );
  }
  for (const prompt of queue) {
    const wrapper = el('div', { className: 'mt-3' }, [promptCard(prompt)]);
    page.append(wrapper);
  }
  app.append(page);
}

async function main(): Promise<void> {
  await initTheme();
  const app = document.querySelector<HTMLDivElement>('#app');
  if (app === null) {
    throw new Error('prompt root element #app not found');
  }
  render(app, await listQueuedPrompts());
  watchPromptQueue((queue) => {
    render(app, queue);
  });
}

void main();
