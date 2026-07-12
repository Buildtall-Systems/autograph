import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { makeGrant } from './permissions';
import {
  InvalidRelayUrlError,
  NoSuchProfileError,
  ProfileExistsError,
  addProfile,
  deleteProfile,
  getActiveProfile,
  getActivePubkey,
  getGrant,
  getProfile,
  listProfiles,
  renameProfile,
  revokeGrant,
  setActivePubkey,
  setGrant,
  setRelays,
  validateRelayUrl,
} from './profiles';
import type { EncryptedBlob } from './vault';

const NOW = 1_700_000_000;
const KEY_A: EncryptedBlob = { ivB64: 'aXY=', ciphertextB64: 'Y2lwaGVy' };
const KEY_B: EncryptedBlob = { ivB64: 'aXYy', ciphertextB64: 'Y2lwaGVyMg==' };
const PUBKEY_A = 'a'.repeat(64);
const PUBKEY_B = 'b'.repeat(64);

describe('profiles', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('starts empty with no active profile', async () => {
    expect(await listProfiles()).toEqual({});
    expect(await getActivePubkey()).toBeNull();
    expect(await getActiveProfile()).toBeNull();
  });

  it('adds a profile and auto-activates the first one', async () => {
    await addProfile(PUBKEY_A, 'primary', KEY_A);
    expect(await getActivePubkey()).toBe(PUBKEY_A);
    const profile = await getProfile(PUBKEY_A);
    expect(profile.name).toBe('primary');
    expect(profile.encryptedKey).toEqual(KEY_A);
    expect(profile.relays).toEqual({});
    expect(profile.permissions).toEqual({});
  });

  it('does not steal the active slot for later profiles', async () => {
    await addProfile(PUBKEY_A, 'first', KEY_A);
    await addProfile(PUBKEY_B, 'second', KEY_B);
    expect(await getActivePubkey()).toBe(PUBKEY_A);
  });

  it('rejects duplicate pubkeys', async () => {
    await addProfile(PUBKEY_A, 'first', KEY_A);
    await expect(addProfile(PUBKEY_A, 'again', KEY_B)).rejects.toThrow(
      ProfileExistsError,
    );
  });

  it('switches the active profile only to existing profiles', async () => {
    await addProfile(PUBKEY_A, 'first', KEY_A);
    await addProfile(PUBKEY_B, 'second', KEY_B);
    await setActivePubkey(PUBKEY_B);
    const active = await getActiveProfile();
    expect(active?.pubkey).toBe(PUBKEY_B);
    await expect(setActivePubkey('c'.repeat(64))).rejects.toThrow(
      NoSuchProfileError,
    );
  });

  it('renames a profile', async () => {
    await addProfile(PUBKEY_A, 'old', KEY_A);
    await renameProfile(PUBKEY_A, 'new');
    expect((await getProfile(PUBKEY_A)).name).toBe('new');
  });

  it('deletes a profile and promotes a successor as active', async () => {
    await addProfile(PUBKEY_A, 'first', KEY_A);
    await addProfile(PUBKEY_B, 'second', KEY_B);
    await deleteProfile(PUBKEY_A);
    expect(await getActivePubkey()).toBe(PUBKEY_B);
    await deleteProfile(PUBKEY_B);
    expect(await getActivePubkey()).toBeNull();
    expect(await listProfiles()).toEqual({});
  });

  it('validates relay URLs as wss only', async () => {
    expect(validateRelayUrl('wss://relay.example')).toBe('wss://relay.example');
    expect(() => validateRelayUrl('ws://relay.example')).toThrow(
      InvalidRelayUrlError,
    );
    expect(() => validateRelayUrl('https://relay.example')).toThrow(
      InvalidRelayUrlError,
    );
    expect(() => validateRelayUrl('not a url')).toThrow(InvalidRelayUrlError);

    await addProfile(PUBKEY_A, 'first', KEY_A);
    await setRelays(PUBKEY_A, {
      'wss://relay.example': { read: true, write: true },
    });
    expect((await getProfile(PUBKEY_A)).relays).toEqual({
      'wss://relay.example': { read: true, write: true },
    });
    await expect(
      setRelays(PUBKEY_A, {
        'ws://plain.example': { read: true, write: false },
      }),
    ).rejects.toThrow(InvalidRelayUrlError);
  });

  it('keeps grants isolated per profile', async () => {
    await addProfile(PUBKEY_A, 'first', KEY_A);
    await addProfile(PUBKEY_B, 'second', KEY_B);
    await setGrant(
      PUBKEY_A,
      'app.example',
      makeGrant('signEvent', 'forever', NOW),
    );
    expect(await getGrant(PUBKEY_A, 'app.example', NOW)).toBeDefined();
    expect(await getGrant(PUBKEY_B, 'app.example', NOW)).toBeUndefined();
  });

  it('prunes expired grants on read and persists the pruning', async () => {
    await addProfile(PUBKEY_A, 'first', KEY_A);
    await setGrant(
      PUBKEY_A,
      'stale.example',
      makeGrant('signEvent', 'expirable_5m', NOW - 3600),
    );
    await setGrant(
      PUBKEY_A,
      'live.example',
      makeGrant('signEvent', 'forever', NOW),
    );
    expect(await getGrant(PUBKEY_A, 'stale.example', NOW)).toBeUndefined();
    const profile = await getProfile(PUBKEY_A);
    expect(Object.keys(profile.permissions)).toEqual(['live.example']);
  });

  it('revokes grants', async () => {
    await addProfile(PUBKEY_A, 'first', KEY_A);
    await setGrant(
      PUBKEY_A,
      'app.example',
      makeGrant('signEvent', 'forever', NOW),
    );
    await revokeGrant(PUBKEY_A, 'app.example');
    expect(await getGrant(PUBKEY_A, 'app.example', NOW)).toBeUndefined();
  });
});
