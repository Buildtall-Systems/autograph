import * as nip04 from 'nostr-tools/nip04';
import * as nip19 from 'nostr-tools/nip19';
import * as nip44 from 'nostr-tools/nip44';
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  verifyEvent,
} from 'nostr-tools/pure';
import type { EventTemplate, SignedEvent } from './protocol';
import { zeroBytes } from './vault';

export const MAX_CACHED_CONVERSATION_KEYS = 100;

const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/;

export class PubkeyMismatchError extends Error {
  constructor(expected: string, got: string) {
    super(`event pubkey ${got} does not match the active profile ${expected}`);
    this.name = 'PubkeyMismatchError';
  }
}

export class InvalidSecretKeyError extends Error {
  constructor() {
    super('secret key must be 64 lowercase hex characters or an nsec');
    this.name = 'InvalidSecretKeyError';
  }
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('hex string has odd length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error('invalid hex string');
    }
    bytes[i] = byte;
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export async function withSecretKey<T>(
  secretKey: Uint8Array,
  use: (secretKey: Uint8Array) => Promise<T> | T,
): Promise<T> {
  try {
    return await use(secretKey);
  } finally {
    zeroBytes(secretKey);
  }
}

export function generateProfileKey(): {
  secretKey: Uint8Array;
  pubkey: string;
  npub: string;
} {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  return { secretKey, pubkey, npub: nip19.npubEncode(pubkey) };
}

export function derivePubkey(secretKey: Uint8Array): string {
  return getPublicKey(secretKey);
}

export function pubkeyToNpub(pubkey: string): string {
  return nip19.npubEncode(pubkey);
}

export function npubToPubkey(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') {
    throw new Error(`expected npub, decoded ${decoded.type}`);
  }
  return decoded.data;
}

export function secretKeyToNsec(secretKey: Uint8Array): string {
  return nip19.nsecEncode(secretKey);
}

export function parseSecretKeyInput(input: string): Uint8Array {
  const trimmed = input.trim();
  if (HEX_KEY_PATTERN.test(trimmed)) {
    return hexToBytes(trimmed);
  }
  if (trimmed.startsWith('nsec1')) {
    let decoded: nip19.DecodedResult;
    try {
      decoded = nip19.decode(trimmed);
    } catch {
      throw new InvalidSecretKeyError();
    }
    if (decoded.type !== 'nsec') {
      throw new InvalidSecretKeyError();
    }
    return decoded.data;
  }
  throw new InvalidSecretKeyError();
}

export function signEventWithKey(
  secretKey: Uint8Array,
  template: EventTemplate,
): SignedEvent {
  const expected = getPublicKey(secretKey);
  if (template.pubkey !== undefined && template.pubkey !== expected) {
    throw new PubkeyMismatchError(expected, template.pubkey);
  }
  const signed = finalizeEvent(
    {
      kind: template.kind,
      created_at: template.created_at,
      tags: template.tags,
      content: template.content,
    },
    secretKey,
  );
  if (!verifyEvent(signed)) {
    throw new Error('finalized event failed verification');
  }
  return signed;
}

const conversationKeys = new Map<string, Uint8Array>();

function conversationKey(
  secretKey: Uint8Array,
  peerPubkey: string,
): Uint8Array {
  const cacheKey = `${getPublicKey(secretKey)}:${peerPubkey}`;
  const cached = conversationKeys.get(cacheKey);
  if (cached !== undefined) {
    conversationKeys.delete(cacheKey);
    conversationKeys.set(cacheKey, cached);
    return cached;
  }
  const derived = nip44.getConversationKey(secretKey, peerPubkey);
  conversationKeys.set(cacheKey, derived);
  if (conversationKeys.size > MAX_CACHED_CONVERSATION_KEYS) {
    const oldest = conversationKeys.keys().next().value;
    if (oldest !== undefined) {
      const evicted = conversationKeys.get(oldest);
      if (evicted !== undefined) {
        zeroBytes(evicted);
      }
      conversationKeys.delete(oldest);
    }
  }
  return derived;
}

export function clearConversationKeyCache(): void {
  for (const key of conversationKeys.values()) {
    zeroBytes(key);
  }
  conversationKeys.clear();
}

export function cachedConversationKeyCount(): number {
  return conversationKeys.size;
}

export function nip44Encrypt(
  secretKey: Uint8Array,
  peerPubkey: string,
  plaintext: string,
): string {
  return nip44.encrypt(plaintext, conversationKey(secretKey, peerPubkey));
}

export function nip44Decrypt(
  secretKey: Uint8Array,
  peerPubkey: string,
  ciphertext: string,
): string {
  return nip44.decrypt(ciphertext, conversationKey(secretKey, peerPubkey));
}

export function nip04Encrypt(
  secretKey: Uint8Array,
  peerPubkey: string,
  plaintext: string,
): string {
  return nip04.encrypt(secretKey, peerPubkey, plaintext);
}

export function nip04Decrypt(
  secretKey: Uint8Array,
  peerPubkey: string,
  ciphertext: string,
): string {
  return nip04.decrypt(secretKey, peerPubkey, ciphertext);
}
