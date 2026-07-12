import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { verifyEvent } from 'nostr-tools/pure';
import { generateProfileKey, withSecretKey } from '@/lib/nostr';
import { makeGrant } from '@/lib/permissions';
import { addProfile, getGrant, setGrant, setRelays } from '@/lib/profiles';
import {
  listQueuedPrompts,
  readUnlockRequest,
  type QueuedPrompt,
} from '@/lib/prompts';
import type { BackgroundRequest, SignedEvent } from '@/lib/protocol';
import { encryptSecret, initializeVault, lockVault } from '@/lib/vault';
import background, {
  answerPrompt,
  handleBackgroundRequest,
  handleUnlockWindowClosed,
  resetPromptState,
} from './index';

const HOST = 'drss.io';
const CREATED_AT = 1_700_000_000;
const PASSPHRASE = 'correct horse battery staple';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function seedProfile(): Promise<string> {
  await initializeVault(PASSPHRASE);
  const { secretKey, pubkey } = generateProfileKey();
  const encryptedKey = await withSecretKey(secretKey, (sk) =>
    encryptSecret(sk),
  );
  await addProfile(pubkey, 'test', encryptedKey);
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

function signEventRequest(
  template?: Record<string, unknown>,
): BackgroundRequest {
  return {
    type: 'signEvent',
    params: {
      event: {
        kind: 1,
        created_at: CREATED_AT,
        tags: [],
        content: 'hello nostr',
        ...template,
      },
    },
    host: HOST,
  };
}

async function onlyQueuedPrompt(): Promise<QueuedPrompt> {
  await expect
    .poll(async () => (await listQueuedPrompts()).length)
    .toBeGreaterThan(0);
  const queue = await listQueuedPrompts();
  const entry = queue[0];
  if (entry === undefined) {
    throw new Error('prompt queue is empty');
  }
  return entry;
}

describe('handleBackgroundRequest', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await resetPromptState();
    background.main();
  });

  it('errors when no profile is active', async () => {
    const result = await handleBackgroundRequest({
      type: 'getPublicKey',
      params: {},
      host: HOST,
    });
    expect(result.error).toBe('no active profile');
  });

  it('returns the active pubkey without needing the vault', async () => {
    const pubkey = await seedGrantedProfile();
    await lockVault();
    const result = await handleBackgroundRequest({
      type: 'getPublicKey',
      params: {},
      host: HOST,
    });
    expect(result.response).toBe(pubkey);
  });

  it('returns the active profile relays', async () => {
    const pubkey = await seedGrantedProfile();
    const relays = {
      'wss://ithaca.buildtall.mesh/': { read: true, write: true },
    };
    await setRelays(pubkey, relays);
    const result = await handleBackgroundRequest({
      type: 'getRelays',
      params: {},
      host: HOST,
    });
    expect(result.response).toEqual(relays);
  });

  it('signs an event that verifies', async () => {
    const pubkey = await seedGrantedProfile();
    const result = await handleBackgroundRequest(signEventRequest());
    const signed = result.response as SignedEvent;
    expect(signed.pubkey).toBe(pubkey);
    expect(signed.content).toBe('hello nostr');
    expect(verifyEvent(signed)).toBe(true);
  });

  it('rejects a template pubkey that is not the active profile', async () => {
    await seedGrantedProfile();
    const result = await handleBackgroundRequest(
      signEventRequest({ pubkey: 'f'.repeat(64) }),
    );
    expect(result.error).toContain('does not match the active profile');
  });

  it('rejects malformed signEvent params', async () => {
    await seedGrantedProfile();
    const result = await handleBackgroundRequest({
      type: 'signEvent',
      params: { event: { kind: 'one' } },
      host: HOST,
    });
    expect(result.error).toBe('malformed signEvent params');
  });

  it('opens an unlock window when locked and rejects when it closes', async () => {
    await seedGrantedProfile();
    await lockVault();
    const pending = handleBackgroundRequest(signEventRequest());
    await expect
      .poll(async () => (await readUnlockRequest()) !== null)
      .toBe(true);
    const unlockRequest = await readUnlockRequest();
    if (unlockRequest === null || unlockRequest.windowId === null) {
      throw new Error('unlock request has no window');
    }
    await handleUnlockWindowClosed(unlockRequest.windowId);
    const result = await pending;
    expect(result.error).toBe('vault is locked');
    expect(await readUnlockRequest()).toBeNull();
  });

  it('round-trips nip44 encryption through the dispatch table', async () => {
    await seedGrantedProfile();
    const peer = generateProfileKey().pubkey;
    const encrypted = await handleBackgroundRequest({
      type: 'nip44.encrypt',
      params: { peer, payload: 'sovereign plaintext' },
      host: HOST,
    });
    expect(encrypted.error).toBeUndefined();
    const decrypted = await handleBackgroundRequest({
      type: 'nip44.decrypt',
      params: { peer, payload: encrypted.response as string },
      host: HOST,
    });
    expect(decrypted.response).toBe('sovereign plaintext');
  });

  it('denies a host holding a "no" grant without prompting', async () => {
    const pubkey = await seedProfile();
    await setGrant(
      pubkey,
      HOST,
      makeGrant('nip44.encrypt', 'no', nowSeconds()),
    );
    const result = await handleBackgroundRequest(signEventRequest());
    expect(result.error).toBe(`${HOST} is denied signEvent`);
    expect(await listQueuedPrompts()).toHaveLength(0);
  });

  it('treats an expired grant as ask, not allow', async () => {
    const pubkey = await seedProfile();
    const oneHourAgo = nowSeconds() - 3600;
    await setGrant(
      pubkey,
      HOST,
      makeGrant('nip44.encrypt', 'expirable_5m', oneHourAgo),
    );
    const pending = handleBackgroundRequest(signEventRequest());
    const prompt = await onlyQueuedPrompt();
    expect(prompt.host).toBe(HOST);
    expect(prompt.capability).toBe('signEvent');
    await answerPrompt(prompt.id, 'single');
    const result = await pending;
    expect(result.error).toBeUndefined();
  });

  it('queues signEvent prompts with kind and content preview', async () => {
    await seedProfile();
    const pending = handleBackgroundRequest(signEventRequest());
    const prompt = await onlyQueuedPrompt();
    expect(prompt.detail).toEqual({
      kind: 1,
      contentPreview: 'hello nostr',
    });
    await answerPrompt(prompt.id, 'single');
    expect((await pending).error).toBeUndefined();
  });

  it('single-use approval does not persist a grant', async () => {
    const pubkey = await seedProfile();
    const pending = handleBackgroundRequest(signEventRequest());
    const prompt = await onlyQueuedPrompt();
    await answerPrompt(prompt.id, 'single');
    const result = await pending;
    expect(verifyEvent(result.response as SignedEvent)).toBe(true);
    expect(await getGrant(pubkey, HOST, nowSeconds())).toBeUndefined();
  });

  it('forever approval persists a grant that silences the next request', async () => {
    const pubkey = await seedProfile();
    const pending = handleBackgroundRequest(signEventRequest());
    const prompt = await onlyQueuedPrompt();
    await answerPrompt(prompt.id, 'forever');
    expect((await pending).error).toBeUndefined();
    const grant = await getGrant(pubkey, HOST, nowSeconds());
    expect(grant?.condition).toBe('forever');
    const second = await handleBackgroundRequest(signEventRequest());
    expect(second.error).toBeUndefined();
    expect(await listQueuedPrompts()).toHaveLength(0);
  });

  it('a "no" answer stores a persistent deny', async () => {
    const pubkey = await seedProfile();
    const pending = handleBackgroundRequest(signEventRequest());
    const prompt = await onlyQueuedPrompt();
    await answerPrompt(prompt.id, 'no');
    expect((await pending).error).toBe(
      'insufficient permissions for signEvent',
    );
    expect((await getGrant(pubkey, HOST, nowSeconds()))?.condition).toBe('no');
    const second = await handleBackgroundRequest(signEventRequest());
    expect(second.error).toBe(`${HOST} is denied signEvent`);
    expect(await listQueuedPrompts()).toHaveLength(0);
  });

  it('deduplicates concurrent identical prompts', async () => {
    await seedProfile();
    const first = handleBackgroundRequest(signEventRequest());
    const second = handleBackgroundRequest(signEventRequest());
    const prompt = await onlyQueuedPrompt();
    expect(await listQueuedPrompts()).toHaveLength(1);
    await answerPrompt(prompt.id, 'single');
    expect((await first).error).toBeUndefined();
    expect((await second).error).toBeUndefined();
    expect(await listQueuedPrompts()).toHaveLength(0);
  });

  it('queues distinct capabilities in one prompt window', async () => {
    await seedProfile();
    const sign = handleBackgroundRequest(signEventRequest());
    const relays = handleBackgroundRequest({
      type: 'getRelays',
      params: {},
      host: HOST,
    });
    await expect.poll(async () => (await listQueuedPrompts()).length).toBe(2);
    const queue = await listQueuedPrompts();
    expect(new Set(queue.map((entry) => entry.windowId)).size).toBe(1);
    for (const entry of queue) {
      await answerPrompt(entry.id, 'single');
    }
    expect((await sign).error).toBeUndefined();
    expect((await relays).error).toBeUndefined();
  });

  it('rejects every pending prompt when the window closes', async () => {
    await seedProfile();
    const first = handleBackgroundRequest(signEventRequest());
    const second = handleBackgroundRequest({
      type: 'getRelays',
      params: {},
      host: HOST,
    });
    await expect.poll(async () => (await listQueuedPrompts()).length).toBe(2);
    const prompt = await onlyQueuedPrompt();
    if (prompt.windowId === null) {
      throw new Error('prompt has no window');
    }
    await fakeBrowser.windows.onRemoved.trigger(prompt.windowId);
    expect((await first).error).toBe('insufficient permissions for signEvent');
    expect((await second).error).toBe('insufficient permissions for getRelays');
    expect(await listQueuedPrompts()).toHaveLength(0);
  });
});
