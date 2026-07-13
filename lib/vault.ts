export const PBKDF2_ITERATIONS = 600_000;
export const PBKDF2_HASH = 'SHA-256';
export const AES_KEY_BITS = 256;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const DEFAULT_AUTOLOCK_SECONDS = 15 * 60;

const VERIFIER_PLAINTEXT = 'autograph-vault-verifier-v1';
export const VAULT_META_STORAGE_KEY = 'vaultMeta';
export const VAULT_SESSION_STORAGE_KEY = 'vaultSession';

export interface EncryptedBlob {
  ivB64: string;
  ciphertextB64: string;
}

interface VaultMeta {
  saltB64: string;
  iterations: number;
  verifier: EncryptedBlob;
  // null means the vault never auto-locks — it stays unlocked until the
  // browser closes (session storage is cleared) or the user locks manually.
  autolockSeconds: number | null;
}

interface VaultSession {
  keyB64: string;
  // null means no deadline; the session persists until the browser clears
  // session storage or lockVault() removes it.
  deadlineMs: number | null;
}

export class VaultExistsError extends Error {
  constructor() {
    super('vault already initialized');
    this.name = 'VaultExistsError';
  }
}

export class NoVaultError extends Error {
  constructor() {
    super('vault not initialized');
    this.name = 'NoVaultError';
  }
}

export class VaultLockedError extends Error {
  constructor() {
    super('vault is locked');
    this.name = 'VaultLockedError';
  }
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('passphrase does not unlock this vault');
    this.name = 'WrongPassphraseError';
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function zeroBytes(bytes: Uint8Array): void {
  bytes.fill(0);
}

async function deriveKeyBits(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: PBKDF2_HASH,
    },
    passphraseKey,
    AES_KEY_BITS,
  );
  return new Uint8Array(bits);
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptWithKey(
  key: CryptoKey,
  plaintext: Uint8Array,
): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext as BufferSource,
  );
  return {
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

async function decryptWithKey(
  key: CryptoKey,
  blob: EncryptedBlob,
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(blob.ivB64) as BufferSource },
    key,
    base64ToBytes(blob.ciphertextB64) as BufferSource,
  );
  return new Uint8Array(plaintext);
}

async function readMeta(): Promise<VaultMeta | null> {
  const stored = await browser.storage.local.get(VAULT_META_STORAGE_KEY);
  return (stored[VAULT_META_STORAGE_KEY] as VaultMeta | undefined) ?? null;
}

async function requireMeta(): Promise<VaultMeta> {
  const meta = await readMeta();
  if (meta === null) {
    throw new NoVaultError();
  }
  return meta;
}

async function readSession(): Promise<VaultSession | null> {
  const stored = await browser.storage.session.get(VAULT_SESSION_STORAGE_KEY);
  const session =
    (stored[VAULT_SESSION_STORAGE_KEY] as VaultSession | undefined) ?? null;
  if (session === null) {
    return null;
  }
  if (session.deadlineMs !== null && Date.now() >= session.deadlineMs) {
    await browser.storage.session.remove(VAULT_SESSION_STORAGE_KEY);
    return null;
  }
  return session;
}

async function startSession(
  keyBytes: Uint8Array,
  autolockSeconds: number | null,
): Promise<void> {
  const session: VaultSession = {
    keyB64: bytesToBase64(keyBytes),
    deadlineMs:
      autolockSeconds === null ? null : Date.now() + autolockSeconds * 1000,
  };
  await browser.storage.session.set({ [VAULT_SESSION_STORAGE_KEY]: session });
}

// Re-base the live session's deadline from now, so a changed timeout — most
// importantly switching to "never" (null) — takes effect on the current
// session instead of only on the next unlock. No-op when locked.
async function rearmSession(autolockSeconds: number | null): Promise<void> {
  const session = await readSession();
  if (session === null) {
    return;
  }
  const next: VaultSession = {
    keyB64: session.keyB64,
    deadlineMs:
      autolockSeconds === null ? null : Date.now() + autolockSeconds * 1000,
  };
  await browser.storage.session.set({ [VAULT_SESSION_STORAGE_KEY]: next });
}

async function sessionKey(): Promise<CryptoKey> {
  const session = await readSession();
  if (session === null) {
    throw new VaultLockedError();
  }
  const keyBytes = base64ToBytes(session.keyB64);
  try {
    return await importAesKey(keyBytes);
  } finally {
    zeroBytes(keyBytes);
  }
}

export async function vaultExists(): Promise<boolean> {
  return (await readMeta()) !== null;
}

export async function isUnlocked(): Promise<boolean> {
  return (await readSession()) !== null;
}

export async function initializeVault(
  passphrase: string,
  autolockSeconds: number | null = DEFAULT_AUTOLOCK_SECONDS,
): Promise<void> {
  if (await vaultExists()) {
    throw new VaultExistsError();
  }
  validateAutolockSeconds(autolockSeconds);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyBytes = await deriveKeyBits(passphrase, salt, PBKDF2_ITERATIONS);
  try {
    const key = await importAesKey(keyBytes);
    const verifier = await encryptWithKey(
      key,
      new TextEncoder().encode(VERIFIER_PLAINTEXT),
    );
    const meta: VaultMeta = {
      saltB64: bytesToBase64(salt),
      iterations: PBKDF2_ITERATIONS,
      verifier,
      autolockSeconds,
    };
    await browser.storage.local.set({ [VAULT_META_STORAGE_KEY]: meta });
    await startSession(keyBytes, autolockSeconds);
  } finally {
    zeroBytes(keyBytes);
  }
}

async function verifyPassphrase(
  meta: VaultMeta,
  passphrase: string,
): Promise<Uint8Array> {
  const keyBytes = await deriveKeyBits(
    passphrase,
    base64ToBytes(meta.saltB64),
    meta.iterations,
  );
  const key = await importAesKey(keyBytes);
  try {
    const plaintext = await decryptWithKey(key, meta.verifier);
    const decoded = new TextDecoder().decode(plaintext);
    zeroBytes(plaintext);
    if (decoded !== VERIFIER_PLAINTEXT) {
      throw new WrongPassphraseError();
    }
  } catch (error) {
    zeroBytes(keyBytes);
    if (error instanceof WrongPassphraseError) {
      throw error;
    }
    throw new WrongPassphraseError();
  }
  return keyBytes;
}

export async function unlockVault(passphrase: string): Promise<void> {
  const meta = await requireMeta();
  const keyBytes = await verifyPassphrase(meta, passphrase);
  try {
    await startSession(keyBytes, meta.autolockSeconds);
  } finally {
    zeroBytes(keyBytes);
  }
}

export async function lockVault(): Promise<void> {
  await browser.storage.session.remove(VAULT_SESSION_STORAGE_KEY);
}

export async function encryptSecret(
  plaintext: Uint8Array,
): Promise<EncryptedBlob> {
  const key = await sessionKey();
  return encryptWithKey(key, plaintext);
}

export async function decryptSecret(blob: EncryptedBlob): Promise<Uint8Array> {
  const key = await sessionKey();
  return decryptWithKey(key, blob);
}

export function validateAutolockSeconds(seconds: number | null): number | null {
  if (seconds === null) {
    return null;
  }
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error(
      `auto-lock timeout must be a positive integer or null, got ${String(seconds)}`,
    );
  }
  return seconds;
}

export async function getAutolockSeconds(): Promise<number | null> {
  const meta = await requireMeta();
  return meta.autolockSeconds;
}

export async function setAutolockSeconds(
  seconds: number | null,
): Promise<void> {
  const meta = await requireMeta();
  meta.autolockSeconds = validateAutolockSeconds(seconds);
  await browser.storage.local.set({ [VAULT_META_STORAGE_KEY]: meta });
  await rearmSession(meta.autolockSeconds);
}

export async function changePassphrase(
  currentPassphrase: string,
  nextPassphrase: string,
  blobs: EncryptedBlob[],
): Promise<EncryptedBlob[]> {
  const meta = await requireMeta();
  const currentKeyBytes = await verifyPassphrase(meta, currentPassphrase);
  const nextSalt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const nextKeyBytes = await deriveKeyBits(
    nextPassphrase,
    nextSalt,
    PBKDF2_ITERATIONS,
  );
  try {
    const currentKey = await importAesKey(currentKeyBytes);
    const nextKey = await importAesKey(nextKeyBytes);

    const rewrapped: EncryptedBlob[] = [];
    for (const blob of blobs) {
      const secret = await decryptWithKey(currentKey, blob);
      try {
        rewrapped.push(await encryptWithKey(nextKey, secret));
      } finally {
        zeroBytes(secret);
      }
    }

    const verifier = await encryptWithKey(
      nextKey,
      new TextEncoder().encode(VERIFIER_PLAINTEXT),
    );
    const nextMeta: VaultMeta = {
      saltB64: bytesToBase64(nextSalt),
      iterations: PBKDF2_ITERATIONS,
      verifier,
      autolockSeconds: meta.autolockSeconds,
    };
    await browser.storage.local.set({ [VAULT_META_STORAGE_KEY]: nextMeta });
    await startSession(nextKeyBytes, meta.autolockSeconds);
    return rewrapped;
  } finally {
    zeroBytes(currentKeyBytes);
    zeroBytes(nextKeyBytes);
  }
}
