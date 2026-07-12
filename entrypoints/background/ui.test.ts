import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { verifyEvent } from 'nostr-tools/pure';
import { generateProfileKey, withSecretKey } from '@/lib/nostr';
import { makeGrant } from '@/lib/permissions';
import { addProfile, getGrant, setGrant } from '@/lib/profiles';
import { listQueuedPrompts, readUnlockRequest } from '@/lib/prompts';
import type { BackgroundRequest, SignedEvent } from '@/lib/protocol';
import { UI_TAG } from '@/lib/ui-messages';
import {
  encryptSecret,
  initializeVault,
  isUnlocked,
  lockVault,
  vaultExists,
} from '@/lib/vault';
import background, {
  handleBackgroundRequest,
  handleUiMessage,
  resetPromptState,
} from './index';

const HOST = 'drss.io';
const CREATED_AT = 1_700_000_000;
const PASSPHRASE = 'correct horse battery staple';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

const NINETY_MINUTES_SECONDS = 90 * 60;

async function seedProfile(): Promise<string> {
  await initializeVault(PASSPHRASE);
  const { secretKey, pubkey } = generateProfileKey();
  const encryptedKey = await withSecretKey(secretKey, (sk) =>
    encryptSecret(sk),
  );
  await addProfile(pubkey, 'ui-test', encryptedKey);
  return pubkey;
}

async function seedGrantedProfile(): Promise<string> {
  const pubkey = await seedProfile();
  await setGrant(
    pubkey,
    HOST,
    makeGrant('nip44.encrypt', 'forever', nowSeconds()),
  );
  return pubkey;
}

function signEventRequest(): BackgroundRequest {
  return {
    type: 'signEvent',
    params: {
      event: {
        kind: 1,
        created_at: CREATED_AT,
        tags: [],
        content: 'hello from the ui suite',
      },
    },
    host: HOST,
  };
}

async function onlyQueuedPromptId(): Promise<string> {
  await expect
    .poll(async () => (await listQueuedPrompts()).length)
    .toBeGreaterThan(0);
  const entry = (await listQueuedPrompts())[0];
  if (entry === undefined) {
    throw new Error('prompt queue is empty');
  }
  return entry.id;
}

describe('handleUiMessage', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await resetPromptState();
    background.main();
  });

  it('answerPrompt stores a grant and resolves the waiting request', async () => {
    const pubkey = await seedProfile();
    const pending = handleBackgroundRequest(signEventRequest());
    const id = await onlyQueuedPromptId();
    const answered = await handleUiMessage({
      ui: UI_TAG,
      action: 'answerPrompt',
      id,
      condition: 'expirable_1h',
    });
    expect(answered.error).toBeUndefined();
    const result = await pending;
    expect(verifyEvent(result.response as SignedEvent)).toBe(true);
    const grant = await getGrant(pubkey, HOST, nowSeconds());
    expect(grant?.condition).toBe('expirable_1h');
  });

  it('answerPrompt with a custom duration persists it', async () => {
    const pubkey = await seedProfile();
    const pending = handleBackgroundRequest(signEventRequest());
    const id = await onlyQueuedPromptId();
    const answered = await handleUiMessage({
      ui: UI_TAG,
      action: 'answerPrompt',
      id,
      condition: 'expirable_custom',
      durationSeconds: NINETY_MINUTES_SECONDS,
    });
    expect(answered.error).toBeUndefined();
    expect((await pending).error).toBeUndefined();
    const grant = await getGrant(pubkey, HOST, nowSeconds());
    expect(grant?.condition).toBe('expirable_custom');
    expect(grant?.durationSeconds).toBe(NINETY_MINUTES_SECONDS);
  });

  it('answerPrompt with an invalid duration leaves the prompt answerable', async () => {
    await seedProfile();
    const pending = handleBackgroundRequest(signEventRequest());
    const id = await onlyQueuedPromptId();
    const answered = await handleUiMessage({
      ui: UI_TAG,
      action: 'answerPrompt',
      id,
      condition: 'expirable_custom',
      durationSeconds: 1,
    });
    expect(answered.error).toContain('custom grant duration');
    expect(await listQueuedPrompts()).toHaveLength(1);
    const retried = await handleUiMessage({
      ui: UI_TAG,
      action: 'answerPrompt',
      id,
      condition: 'single',
    });
    expect(retried.error).toBeUndefined();
    expect((await pending).error).toBeUndefined();
  });

  it('unlock completes a request that was waiting on the vault', async () => {
    const pubkey = await seedGrantedProfile();
    await lockVault();
    const pending = handleBackgroundRequest(signEventRequest());
    await expect
      .poll(async () => (await readUnlockRequest()) !== null)
      .toBe(true);
    const unlocked = await handleUiMessage({
      ui: UI_TAG,
      action: 'unlock',
      passphrase: PASSPHRASE,
    });
    expect(unlocked.error).toBeUndefined();
    const result = await pending;
    const signed = result.response as SignedEvent;
    expect(signed.pubkey).toBe(pubkey);
    expect(verifyEvent(signed)).toBe(true);
    expect(await readUnlockRequest()).toBeNull();
  });

  it('a wrong passphrase reports an error and leaves the request waiting', async () => {
    await seedGrantedProfile();
    await lockVault();
    const pending = handleBackgroundRequest(signEventRequest());
    await expect
      .poll(async () => (await readUnlockRequest()) !== null)
      .toBe(true);
    const wrong = await handleUiMessage({
      ui: UI_TAG,
      action: 'unlock',
      passphrase: 'not the passphrase',
    });
    expect(wrong.error).toBe('passphrase does not unlock this vault');
    expect(await isUnlocked()).toBe(false);
    expect(await readUnlockRequest()).not.toBeNull();
    const right = await handleUiMessage({
      ui: UI_TAG,
      action: 'unlock',
      passphrase: PASSPHRASE,
    });
    expect(right.error).toBeUndefined();
    expect((await pending).error).toBeUndefined();
  });

  it('createVault initializes and unlocks a fresh vault', async () => {
    expect(await vaultExists()).toBe(false);
    const created = await handleUiMessage({
      ui: UI_TAG,
      action: 'createVault',
      passphrase: PASSPHRASE,
    });
    expect(created.error).toBeUndefined();
    expect(await vaultExists()).toBe(true);
    expect(await isUnlocked()).toBe(true);
  });

  it('lock locks the vault', async () => {
    await seedProfile();
    expect(await isUnlocked()).toBe(true);
    const locked = await handleUiMessage({ ui: UI_TAG, action: 'lock' });
    expect(locked.error).toBeUndefined();
    expect(await isUnlocked()).toBe(false);
  });
});
