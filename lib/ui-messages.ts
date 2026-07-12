import { isGrantCondition, type GrantCondition } from './permissions';
import { isBackgroundResponse, type BackgroundResponse } from './protocol';

export const UI_TAG = 'autograph-ui';

export interface AnswerPromptMessage {
  ui: typeof UI_TAG;
  action: 'answerPrompt';
  id: string;
  condition: GrantCondition;
  durationSeconds?: number;
}

export interface UnlockMessage {
  ui: typeof UI_TAG;
  action: 'unlock';
  passphrase: string;
}

export interface CreateVaultMessage {
  ui: typeof UI_TAG;
  action: 'createVault';
  passphrase: string;
}

export interface LockMessage {
  ui: typeof UI_TAG;
  action: 'lock';
}

export type UiMessage =
  AnswerPromptMessage | UnlockMessage | CreateVaultMessage | LockMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isUiMessage(value: unknown): value is UiMessage {
  if (!isRecord(value) || value.ui !== UI_TAG) {
    return false;
  }
  switch (value.action) {
    case 'answerPrompt':
      return (
        typeof value.id === 'string' &&
        isGrantCondition(value.condition) &&
        (value.durationSeconds === undefined ||
          typeof value.durationSeconds === 'number')
      );
    case 'unlock':
    case 'createVault':
      return typeof value.passphrase === 'string';
    case 'lock':
      return true;
    default:
      return false;
  }
}

export async function sendUiMessage(
  message: UiMessage,
): Promise<BackgroundResponse> {
  const result: unknown = await browser.runtime.sendMessage(message);
  if (!isBackgroundResponse(result)) {
    return { error: 'malformed background response' };
  }
  return result;
}
