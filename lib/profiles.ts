import { pruneExpired, type Grant, type PermissionMap } from './permissions';
import type { RelayMap } from './protocol';
import type { EncryptedBlob } from './vault';

const PROFILES_STORAGE_KEY = 'profiles';
const ACTIVE_PUBKEY_STORAGE_KEY = 'activePubkey';

export interface Profile {
  name: string;
  encryptedKey: EncryptedBlob;
  relays: RelayMap;
  permissions: PermissionMap;
}

export type ProfileMap = Record<string, Profile>;

export class ProfileExistsError extends Error {
  constructor(pubkey: string) {
    super(`profile already exists for pubkey ${pubkey}`);
    this.name = 'ProfileExistsError';
  }
}

export class NoSuchProfileError extends Error {
  constructor(pubkey: string) {
    super(`no profile for pubkey ${pubkey}`);
    this.name = 'NoSuchProfileError';
  }
}

export class InvalidRelayUrlError extends Error {
  constructor(url: string) {
    super(`relay URL must be wss://, got ${url}`);
    this.name = 'InvalidRelayUrlError';
  }
}

export function validateRelayUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidRelayUrlError(url);
  }
  if (parsed.protocol !== 'wss:') {
    throw new InvalidRelayUrlError(url);
  }
  return url;
}

async function readProfiles(): Promise<ProfileMap> {
  const stored = await browser.storage.local.get(PROFILES_STORAGE_KEY);
  return (stored[PROFILES_STORAGE_KEY] as ProfileMap | undefined) ?? {};
}

async function writeProfiles(profiles: ProfileMap): Promise<void> {
  await browser.storage.local.set({ [PROFILES_STORAGE_KEY]: profiles });
}

function requireProfile(profiles: ProfileMap, pubkey: string): Profile {
  const profile = profiles[pubkey];
  if (profile === undefined) {
    throw new NoSuchProfileError(pubkey);
  }
  return profile;
}

export async function listProfiles(): Promise<ProfileMap> {
  return readProfiles();
}

export async function getProfile(pubkey: string): Promise<Profile> {
  return requireProfile(await readProfiles(), pubkey);
}

export async function addProfile(
  pubkey: string,
  name: string,
  encryptedKey: EncryptedBlob,
): Promise<void> {
  const profiles = await readProfiles();
  if (profiles[pubkey] !== undefined) {
    throw new ProfileExistsError(pubkey);
  }
  profiles[pubkey] = { name, encryptedKey, relays: {}, permissions: {} };
  await writeProfiles(profiles);
  if ((await getActivePubkey()) === null) {
    await setActivePubkey(pubkey);
  }
}

export async function renameProfile(
  pubkey: string,
  name: string,
): Promise<void> {
  const profiles = await readProfiles();
  const profile = requireProfile(profiles, pubkey);
  profile.name = name;
  await writeProfiles(profiles);
}

export async function deleteProfile(pubkey: string): Promise<void> {
  const profiles = await readProfiles();
  requireProfile(profiles, pubkey);
  const { [pubkey]: removed, ...remaining } = profiles;
  void removed;
  await writeProfiles(remaining);
  if ((await getActivePubkey()) === pubkey) {
    const successor = Object.keys(remaining)[0] ?? null;
    await setActivePubkey(successor);
  }
}

export async function getActivePubkey(): Promise<string | null> {
  const stored = await browser.storage.local.get(ACTIVE_PUBKEY_STORAGE_KEY);
  return (stored[ACTIVE_PUBKEY_STORAGE_KEY] as string | undefined) ?? null;
}

export async function setActivePubkey(pubkey: string | null): Promise<void> {
  if (pubkey === null) {
    await browser.storage.local.remove(ACTIVE_PUBKEY_STORAGE_KEY);
    return;
  }
  requireProfile(await readProfiles(), pubkey);
  await browser.storage.local.set({ [ACTIVE_PUBKEY_STORAGE_KEY]: pubkey });
}

export async function getActiveProfile(): Promise<{
  pubkey: string;
  profile: Profile;
} | null> {
  const pubkey = await getActivePubkey();
  if (pubkey === null) {
    return null;
  }
  const profiles = await readProfiles();
  const profile = profiles[pubkey];
  if (profile === undefined) {
    return null;
  }
  return { pubkey, profile };
}

export async function setRelays(
  pubkey: string,
  relays: RelayMap,
): Promise<void> {
  for (const url of Object.keys(relays)) {
    validateRelayUrl(url);
  }
  const profiles = await readProfiles();
  const profile = requireProfile(profiles, pubkey);
  profile.relays = relays;
  await writeProfiles(profiles);
}

export async function replaceEncryptedKey(
  pubkey: string,
  encryptedKey: EncryptedBlob,
): Promise<void> {
  const profiles = await readProfiles();
  const profile = requireProfile(profiles, pubkey);
  profile.encryptedKey = encryptedKey;
  await writeProfiles(profiles);
}

export async function getGrant(
  pubkey: string,
  host: string,
  nowSeconds: number,
): Promise<Grant | undefined> {
  const profiles = await readProfiles();
  const profile = requireProfile(profiles, pubkey);
  const { pruned, changed } = pruneExpired(profile.permissions, nowSeconds);
  if (changed) {
    profile.permissions = pruned;
    await writeProfiles(profiles);
  }
  return pruned[host];
}

export async function setGrant(
  pubkey: string,
  host: string,
  grant: Grant,
): Promise<void> {
  const profiles = await readProfiles();
  const profile = requireProfile(profiles, pubkey);
  profile.permissions[host] = grant;
  await writeProfiles(profiles);
}

export async function revokeGrant(pubkey: string, host: string): Promise<void> {
  const profiles = await readProfiles();
  const profile = requireProfile(profiles, pubkey);
  const { [host]: removed, ...remaining } = profile.permissions;
  void removed;
  profile.permissions = remaining;
  await writeProfiles(profiles);
}
