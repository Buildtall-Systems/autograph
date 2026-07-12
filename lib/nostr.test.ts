import { beforeEach, describe, expect, it } from 'vitest';
import {
  InvalidSecretKeyError,
  MAX_CACHED_CONVERSATION_KEYS,
  PubkeyMismatchError,
  bytesToHex,
  cachedConversationKeyCount,
  clearConversationKeyCache,
  derivePubkey,
  generateProfileKey,
  hexToBytes,
  nip04Decrypt,
  nip04Encrypt,
  nip44Decrypt,
  nip44Encrypt,
  npubToPubkey,
  parseSecretKeyInput,
  pubkeyToNpub,
  secretKeyToNsec,
  signEventWithKey,
  withSecretKey,
} from './nostr';
import type { EventTemplate } from './protocol';

function template(overrides?: Partial<EventTemplate>): EventTemplate {
  return {
    kind: 1,
    created_at: 1_700_000_000,
    tags: [['t', 'autograph']],
    content: 'signed by autograph',
    ...overrides,
  };
}

describe('hex helpers', () => {
  it('round-trips bytes through hex', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('rejects malformed hex', () => {
    expect(() => hexToBytes('abc')).toThrow('odd length');
    expect(() => hexToBytes('zz')).toThrow('invalid hex');
  });
});

describe('key generation and NIP-19', () => {
  it('generates keys whose npub round-trips', () => {
    const { secretKey, pubkey, npub } = generateProfileKey();
    expect(derivePubkey(secretKey)).toBe(pubkey);
    expect(npub.startsWith('npub1')).toBe(true);
    expect(npubToPubkey(npub)).toBe(pubkey);
    expect(pubkeyToNpub(pubkey)).toBe(npub);
  });

  it('accepts hex and nsec secret key input, rejects garbage', () => {
    const { secretKey } = generateProfileKey();
    const hex = bytesToHex(secretKey);
    const nsec = secretKeyToNsec(secretKey);
    expect(parseSecretKeyInput(hex)).toEqual(secretKey);
    expect(parseSecretKeyInput(` ${nsec} `)).toEqual(secretKey);
    expect(() => parseSecretKeyInput('npub1invalid')).toThrow(
      InvalidSecretKeyError,
    );
    expect(() => parseSecretKeyInput('nsec1notvalidbech32')).toThrow(
      InvalidSecretKeyError,
    );
    expect(() => parseSecretKeyInput('deadbeef')).toThrow(
      InvalidSecretKeyError,
    );
  });
});

describe('signEventWithKey', () => {
  it('fills id, pubkey, sig and verifies', () => {
    const { secretKey, pubkey } = generateProfileKey();
    const signed = signEventWithKey(secretKey, template());
    expect(signed.pubkey).toBe(pubkey);
    expect(signed.id).toMatch(/^[0-9a-f]{64}$/);
    expect(signed.sig).toMatch(/^[0-9a-f]{128}$/);
    expect(signed.kind).toBe(1);
    expect(signed.content).toBe('signed by autograph');
  });

  it('accepts a template carrying the matching pubkey', () => {
    const { secretKey, pubkey } = generateProfileKey();
    const signed = signEventWithKey(secretKey, template({ pubkey }));
    expect(signed.pubkey).toBe(pubkey);
  });

  it('rejects a template carrying a foreign pubkey', () => {
    const { secretKey } = generateProfileKey();
    const { pubkey: foreign } = generateProfileKey();
    expect(() =>
      signEventWithKey(secretKey, template({ pubkey: foreign })),
    ).toThrow(PubkeyMismatchError);
  });
});

describe('withSecretKey', () => {
  it('zeroes the key after use and propagates the result', async () => {
    const { secretKey } = generateProfileKey();
    const copy = new Uint8Array(secretKey);
    const result = await withSecretKey(secretKey, (key) =>
      signEventWithKey(key, template()),
    );
    expect(result.sig).toBeDefined();
    expect(secretKey).toEqual(new Uint8Array(32));
    expect(copy).not.toEqual(new Uint8Array(32));
  });

  it('zeroes the key even when use throws', async () => {
    const { secretKey } = generateProfileKey();
    await expect(
      withSecretKey(secretKey, () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(secretKey).toEqual(new Uint8Array(32));
  });
});

describe('nip44', () => {
  beforeEach(() => {
    clearConversationKeyCache();
  });

  it('round-trips between two parties', () => {
    const alice = generateProfileKey();
    const bob = generateProfileKey();
    const ciphertext = nip44Encrypt(alice.secretKey, bob.pubkey, 'hello bob');
    expect(ciphertext).not.toContain('hello bob');
    expect(nip44Decrypt(bob.secretKey, alice.pubkey, ciphertext)).toBe(
      'hello bob',
    );
  });

  it('caches conversation keys with an eviction cap', () => {
    const alice = generateProfileKey();
    nip44Encrypt(alice.secretKey, generateProfileKey().pubkey, 'x');
    nip44Encrypt(alice.secretKey, generateProfileKey().pubkey, 'x');
    expect(cachedConversationKeyCount()).toBe(2);
    for (let i = 0; i < MAX_CACHED_CONVERSATION_KEYS + 10; i++) {
      nip44Encrypt(alice.secretKey, generateProfileKey().pubkey, 'x');
    }
    expect(cachedConversationKeyCount()).toBe(MAX_CACHED_CONVERSATION_KEYS);
  });

  it('rejects tampered ciphertext', () => {
    const alice = generateProfileKey();
    const bob = generateProfileKey();
    const ciphertext = nip44Encrypt(alice.secretKey, bob.pubkey, 'payload');
    const tampered = `${ciphertext.slice(0, -4)}AAAA`;
    expect(() => nip44Decrypt(bob.secretKey, alice.pubkey, tampered)).toThrow();
  });
});

describe('nip04 (legacy)', () => {
  it('round-trips between two parties', () => {
    const alice = generateProfileKey();
    const bob = generateProfileKey();
    const ciphertext = nip04Encrypt(alice.secretKey, bob.pubkey, 'legacy dm');
    expect(ciphertext).toContain('?iv=');
    expect(nip04Decrypt(bob.secretKey, alice.pubkey, ciphertext)).toBe(
      'legacy dm',
    );
  });
});
