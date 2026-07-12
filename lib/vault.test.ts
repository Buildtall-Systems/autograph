import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DEFAULT_AUTOLOCK_SECONDS,
  PBKDF2_ITERATIONS,
  VaultExistsError,
  VaultLockedError,
  WrongPassphraseError,
  base64ToBytes,
  bytesToBase64,
  changePassphrase,
  decryptSecret,
  encryptSecret,
  getAutolockSeconds,
  initializeVault,
  isUnlocked,
  lockVault,
  setAutolockSeconds,
  unlockVault,
  validateAutolockSeconds,
  vaultExists,
  zeroBytes,
} from './vault';

const PASSPHRASE = 'correct horse battery staple';
const SECRET = new TextEncoder().encode('a-32-byte-secret-key-goes-here!!');

describe('vault', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the hardened iteration count', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it('round-trips base64 helpers', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(37));
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('zeroes byte arrays', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    zeroBytes(bytes);
    expect(bytes).toEqual(new Uint8Array([0, 0, 0]));
  });

  it('does not exist before initialization', async () => {
    expect(await vaultExists()).toBe(false);
    expect(await isUnlocked()).toBe(false);
  });

  it('initializes unlocked and refuses re-initialization', async () => {
    await initializeVault(PASSPHRASE);
    expect(await vaultExists()).toBe(true);
    expect(await isUnlocked()).toBe(true);
    expect(await getAutolockSeconds()).toBe(DEFAULT_AUTOLOCK_SECONDS);
    await expect(initializeVault(PASSPHRASE)).rejects.toThrow(VaultExistsError);
  });

  it('round-trips a secret and never stores it in plaintext', async () => {
    await initializeVault(PASSPHRASE);
    const blob = await encryptSecret(SECRET);
    expect(blob.ciphertextB64).not.toContain(bytesToBase64(SECRET));

    const everything = await fakeBrowser.storage.local.get(null);
    const flat = JSON.stringify(everything);
    expect(flat).not.toContain(bytesToBase64(SECRET));
    expect(flat).not.toContain('a-32-byte-secret-key');

    const decrypted = await decryptSecret(blob);
    expect(decrypted).toEqual(SECRET);
  });

  it('produces distinct ciphertexts for the same plaintext (fresh IVs)', async () => {
    await initializeVault(PASSPHRASE);
    const first = await encryptSecret(SECRET);
    const second = await encryptSecret(SECRET);
    expect(first.ivB64).not.toBe(second.ivB64);
    expect(first.ciphertextB64).not.toBe(second.ciphertextB64);
  });

  it('locks and refuses crypto operations while locked', async () => {
    await initializeVault(PASSPHRASE);
    const blob = await encryptSecret(SECRET);
    await lockVault();
    expect(await isUnlocked()).toBe(false);
    await expect(encryptSecret(SECRET)).rejects.toThrow(VaultLockedError);
    await expect(decryptSecret(blob)).rejects.toThrow(VaultLockedError);
  });

  it('unlocks with the right passphrase, rejects the wrong one', async () => {
    await initializeVault(PASSPHRASE);
    const blob = await encryptSecret(SECRET);
    await lockVault();
    await expect(unlockVault('wrong')).rejects.toThrow(WrongPassphraseError);
    expect(await isUnlocked()).toBe(false);
    await unlockVault(PASSPHRASE);
    expect(await decryptSecret(blob)).toEqual(SECRET);
  });

  it('detects ciphertext tampering', async () => {
    await initializeVault(PASSPHRASE);
    const blob = await encryptSecret(SECRET);
    const corrupted = base64ToBytes(blob.ciphertextB64);
    const firstByte = corrupted[0] ?? 0;
    corrupted[0] = firstByte ^ 0xff;
    await expect(
      decryptSecret({
        ivB64: blob.ivB64,
        ciphertextB64: bytesToBase64(corrupted),
      }),
    ).rejects.toThrow();
  });

  it('auto-locks when the deadline passes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    await initializeVault(PASSPHRASE, 60);
    expect(await isUnlocked()).toBe(true);
    vi.setSystemTime(new Date('2026-07-12T12:00:59Z'));
    expect(await isUnlocked()).toBe(true);
    vi.setSystemTime(new Date('2026-07-12T12:01:00Z'));
    expect(await isUnlocked()).toBe(false);
    await expect(encryptSecret(SECRET)).rejects.toThrow(VaultLockedError);
  });

  it('validates auto-lock bounds', () => {
    expect(validateAutolockSeconds(1)).toBe(1);
    expect(() => validateAutolockSeconds(0)).toThrow();
    expect(() => validateAutolockSeconds(-5)).toThrow();
    expect(() => validateAutolockSeconds(1.5)).toThrow();
  });

  it('persists a changed auto-lock timeout', async () => {
    await initializeVault(PASSPHRASE);
    await setAutolockSeconds(120);
    expect(await getAutolockSeconds()).toBe(120);
  });

  it('changes the passphrase and rewraps secrets', async () => {
    await initializeVault(PASSPHRASE);
    const blobA = await encryptSecret(SECRET);
    const other = new TextEncoder().encode('another-secret');
    const blobB = await encryptSecret(other);

    const next = 'entirely new passphrase';
    const [rewrappedA, rewrappedB] = await changePassphrase(PASSPHRASE, next, [
      blobA,
      blobB,
    ]);
    expect(rewrappedA).toBeDefined();
    expect(rewrappedB).toBeDefined();

    expect(await decryptSecret(rewrappedA as never)).toEqual(SECRET);
    expect(await decryptSecret(rewrappedB as never)).toEqual(other);

    await lockVault();
    await expect(unlockVault(PASSPHRASE)).rejects.toThrow(WrongPassphraseError);
    await unlockVault(next);
    await expect(decryptSecret(blobA)).rejects.toThrow();
  });

  it('rejects passphrase change with the wrong current passphrase', async () => {
    await initializeVault(PASSPHRASE);
    await expect(changePassphrase('wrong', 'new', [])).rejects.toThrow(
      WrongPassphraseError,
    );
  });
});
