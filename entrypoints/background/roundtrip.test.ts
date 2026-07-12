import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { verifyEvent } from 'nostr-tools/pure';
import { generateProfileKey, withSecretKey } from '@/lib/nostr';
import { makeGrant } from '@/lib/permissions';
import { addProfile, setGrant } from '@/lib/profiles';
import { encryptSecret, initializeVault, lockVault } from '@/lib/vault';
import { isBackgroundRequest } from '@/lib/protocol';
import { relayToBackground } from '@/entrypoints/autograph.content';
import { handleBackgroundRequest, resetPromptState } from './index';
import {
  createProvider,
  type NostrProvider,
} from '@/entrypoints/nostr-provider';

const HOST = 'listoflists.lol';
const PASSPHRASE = 'correct horse battery staple';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function seedGrantedProfile(): Promise<string> {
  await initializeVault(PASSPHRASE);
  const { secretKey, pubkey } = generateProfileKey();
  const encryptedKey = await withSecretKey(secretKey, (sk) =>
    encryptSecret(sk),
  );
  await addProfile(pubkey, 'integration', encryptedKey);
  await setGrant(
    pubkey,
    HOST,
    makeGrant('nip44.encrypt', 'forever', nowSeconds()),
  );
  return pubkey;
}

// Assembles the full three-hop pipeline with the postMessage boundary
// replaced by direct delivery: provider -> content-script relay ->
// background onMessage listener registered by background.main().
function assemblePipeline(): NostrProvider {
  let deliver: (data: unknown) => void = () => undefined;
  const provider = createProvider((request) => {
    void relayToBackground(request, HOST).then((response) => {
      deliver(response);
    });
  });
  deliver = provider.deliver;
  return provider.nostr;
}

describe('NIP-07 round trip', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await resetPromptState();
    // fakeBrowser models the webextension-polyfill convention (a returned
    // promise is the response) and passes no sendResponse function, so the
    // native sendResponse listener registered by background main() cannot
    // run here. This adapter stands in for it; the native listener mechanics
    // are exercised by the phase-3 manual check in real browsers.
    fakeBrowser.runtime.onMessage.addListener((message: unknown) => {
      if (!isBackgroundRequest(message)) {
        return;
      }
      return handleBackgroundRequest(message);
    });
  });

  it('resolves getPublicKey through all three hops', async () => {
    const pubkey = await seedGrantedProfile();
    const nostr = assemblePipeline();
    await expect(nostr.getPublicKey()).resolves.toBe(pubkey);
  });

  it('produces a validly signed event end-to-end', async () => {
    const pubkey = await seedGrantedProfile();
    const nostr = assemblePipeline();
    const signed = await nostr.signEvent({
      kind: 1,
      created_at: nowSeconds(),
      tags: [['client', 'autograph']],
      content: 'signed across the relay',
    });
    expect(signed.pubkey).toBe(pubkey);
    expect(verifyEvent(signed)).toBe(true);
  });

  it('round-trips nip44 encryption end-to-end', async () => {
    await seedGrantedProfile();
    const nostr = assemblePipeline();
    const peer = generateProfileKey().pubkey;
    const ciphertext = await nostr.nip44.encrypt(peer, 'meshworthy secret');
    expect(ciphertext).not.toBe('meshworthy secret');
    await expect(nostr.nip44.decrypt(peer, ciphertext)).resolves.toBe(
      'meshworthy secret',
    );
  });

  it('surfaces a locked vault as a provider rejection', async () => {
    await seedGrantedProfile();
    await lockVault();
    const nostr = assemblePipeline();
    await expect(
      nostr.signEvent({
        kind: 1,
        created_at: nowSeconds(),
        tags: [],
        content: 'should fail',
      }),
    ).rejects.toThrow('autograph: vault is locked');
  });
});
