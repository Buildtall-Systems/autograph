import { describe, expect, it } from 'vitest';
import { UI_TAG, isUiMessage } from './ui-messages';

describe('isUiMessage', () => {
  it('accepts a well-formed answerPrompt message', () => {
    expect(
      isUiMessage({
        ui: UI_TAG,
        action: 'answerPrompt',
        id: 'abc',
        condition: 'forever',
      }),
    ).toBe(true);
  });

  it('accepts answerPrompt with a numeric duration', () => {
    expect(
      isUiMessage({
        ui: UI_TAG,
        action: 'answerPrompt',
        id: 'abc',
        condition: 'expirable_custom',
        durationSeconds: 3600,
      }),
    ).toBe(true);
  });

  it('rejects answerPrompt with an unknown condition', () => {
    expect(
      isUiMessage({
        ui: UI_TAG,
        action: 'answerPrompt',
        id: 'abc',
        condition: 'sometimes',
      }),
    ).toBe(false);
  });

  it('accepts unlock, createVault, and lock messages', () => {
    expect(isUiMessage({ ui: UI_TAG, action: 'unlock', passphrase: 'p' })).toBe(
      true,
    );
    expect(
      isUiMessage({ ui: UI_TAG, action: 'createVault', passphrase: 'p' }),
    ).toBe(true);
    expect(isUiMessage({ ui: UI_TAG, action: 'lock' })).toBe(true);
  });

  it('rejects unlock without a passphrase', () => {
    expect(isUiMessage({ ui: UI_TAG, action: 'unlock' })).toBe(false);
  });

  it('rejects messages missing the ui tag', () => {
    expect(isUiMessage({ action: 'lock' })).toBe(false);
  });

  it('rejects the three-hop protocol shapes', () => {
    expect(
      isUiMessage({ type: 'getPublicKey', params: {}, host: 'drss.io' }),
    ).toBe(false);
    expect(isUiMessage(null)).toBe(false);
    expect(isUiMessage('lock')).toBe(false);
  });
});
