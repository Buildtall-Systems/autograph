import {
  clearConversationKeyCache,
  nip04Decrypt,
  nip04Encrypt,
  nip44Decrypt,
  nip44Encrypt,
  signEventWithKey,
  withSecretKey,
} from '@/lib/nostr';
import {
  decideCapability,
  makeGrant,
  type Grant,
  type GrantCondition,
} from '@/lib/permissions';
import { getActiveProfile, getGrant, setGrant } from '@/lib/profiles';
import {
  clearUnlockRequest,
  contentPreview,
  readPromptQueue,
  writePromptQueue,
  writeUnlockRequest,
  type QueuedPrompt,
  type SignEventDetail,
  type SurfaceHandle,
} from '@/lib/prompts';
import {
  isBackgroundRequest,
  isCipherParams,
  isSignEventParams,
  newRequestId,
  type BackgroundRequest,
  type BackgroundResponse,
  type Capability,
} from '@/lib/protocol';
import { isUiMessage, type UiMessage } from '@/lib/ui-messages';
import type { PublicPath } from 'wxt/browser';
import {
  VaultLockedError,
  decryptSecret,
  initializeVault,
  isUnlocked,
  lockVault,
  unlockVault,
} from '@/lib/vault';
import type { Profile } from '@/lib/profiles';

export const PROMPT_WINDOW_WIDTH = 400;
export const PROMPT_WINDOW_HEIGHT = 520;
export const UNLOCK_WINDOW_WIDTH = 400;
export const UNLOCK_WINDOW_HEIGHT = 360;
const MS_PER_SECOND = 1000;

function nowSeconds(): number {
  return Math.floor(Date.now() / MS_PER_SECOND);
}

interface ExecutionContext {
  pubkey: string;
  profile: Profile;
  params: unknown;
  secretKey: Uint8Array | null;
}

interface CapabilityHandler {
  needsSecret: boolean;
  execute: (context: ExecutionContext) => unknown;
}

function requireSecret(secretKey: Uint8Array | null): Uint8Array {
  if (secretKey === null) {
    throw new Error('capability executed without an unlocked secret');
  }
  return secretKey;
}

const DISPATCH: Record<Capability, CapabilityHandler> = {
  getPublicKey: {
    needsSecret: false,
    execute: ({ pubkey }) => pubkey,
  },
  getRelays: {
    needsSecret: false,
    execute: ({ profile }) => profile.relays,
  },
  signEvent: {
    needsSecret: true,
    execute: ({ secretKey, params }) => {
      if (!isSignEventParams(params)) {
        throw new Error('malformed signEvent params');
      }
      return signEventWithKey(requireSecret(secretKey), params.event);
    },
  },
  'nip04.encrypt': {
    needsSecret: true,
    execute: ({ secretKey, params }) => {
      if (!isCipherParams(params)) {
        throw new Error('malformed nip04.encrypt params');
      }
      return nip04Encrypt(
        requireSecret(secretKey),
        params.peer,
        params.payload,
      );
    },
  },
  'nip04.decrypt': {
    needsSecret: true,
    execute: ({ secretKey, params }) => {
      if (!isCipherParams(params)) {
        throw new Error('malformed nip04.decrypt params');
      }
      return nip04Decrypt(
        requireSecret(secretKey),
        params.peer,
        params.payload,
      );
    },
  },
  'nip44.encrypt': {
    needsSecret: true,
    execute: ({ secretKey, params }) => {
      if (!isCipherParams(params)) {
        throw new Error('malformed nip44.encrypt params');
      }
      return nip44Encrypt(
        requireSecret(secretKey),
        params.peer,
        params.payload,
      );
    },
  },
  'nip44.decrypt': {
    needsSecret: true,
    execute: ({ secretKey, params }) => {
      if (!isCipherParams(params)) {
        throw new Error('malformed nip44.decrypt params');
      }
      return nip44Decrypt(
        requireSecret(secretKey),
        params.peer,
        params.payload,
      );
    },
  },
};

// Prompt queue: persisted in storage.local so it survives MV3 service-worker
// restarts; the in-memory maps hold the resolver ends of promises that cannot
// outlive the worker anyway (the requesting message channel dies with it).
interface PendingApproval {
  dedupKey: string;
  settle: (allowed: boolean) => void;
}

const pendingApprovals = new Map<string, PendingApproval>();
const approvalsByDedupKey = new Map<string, Promise<boolean>>();
let promptSurface: Promise<SurfaceHandle | null> | null = null;
let queueLock: Promise<void> = Promise.resolve();

function withQueueLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = queueLock.then(operation);
  queueLock = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function resetPromptState(): Promise<void> {
  promptSurface = null;
  for (const [id] of pendingApprovals) {
    settleApproval(id, false);
  }
  await withQueueLock(() => writePromptQueue([]));
  unlockSurface = null;
  settleUnlock(false);
  await clearUnlockRequest();
}

function settleApproval(id: string, allowed: boolean): void {
  const pending = pendingApprovals.get(id);
  if (pending === undefined) {
    return;
  }
  pendingApprovals.delete(id);
  approvalsByDedupKey.delete(pending.dedupKey);
  pending.settle(allowed);
}

// Firefox for Android ships no windows API at all; the property is absent
// rather than throwing, so one detection point decides how every surface in
// this file is opened, closed, and observed.
function windowsApi(): typeof browser.windows | undefined {
  return (browser as { windows?: typeof browser.windows }).windows;
}

async function createExtensionSurface(
  path: PublicPath,
  width: number,
  height: number,
): Promise<SurfaceHandle | null> {
  const url = browser.runtime.getURL(path);
  const windows = windowsApi();
  if (windows === undefined) {
    const tab = await browser.tabs.create({ url });
    return tab.id === undefined ? null : { kind: 'tab', id: tab.id };
  }
  const created = await windows.create({
    url,
    type: 'popup',
    width,
    height,
  });
  return created?.id === undefined ? null : { kind: 'window', id: created.id };
}

async function closeSurface(
  surface: SurfaceHandle,
  description: string,
): Promise<void> {
  try {
    if (surface.kind === 'tab') {
      await browser.tabs.remove(surface.id);
      return;
    }
    const windows = windowsApi();
    if (windows === undefined) {
      return;
    }
    await windows.remove(surface.id);
  } catch (error) {
    console.warn(`autograph: ${description} already gone`, error);
  }
}

function isSameSurface(surface: SurfaceHandle, other: SurfaceHandle): boolean {
  return surface.kind === other.kind && surface.id === other.id;
}

function ensurePromptSurface(): Promise<SurfaceHandle | null> {
  promptSurface ??= createExtensionSurface(
    '/prompt.html',
    PROMPT_WINDOW_WIDTH,
    PROMPT_WINDOW_HEIGHT,
  );
  return promptSurface;
}

export async function promptForCapability(
  host: string,
  capability: Capability,
  detail?: SignEventDetail,
): Promise<boolean> {
  const dedupKey = `${host}|${capability}`;
  const existing = approvalsByDedupKey.get(dedupKey);
  if (existing !== undefined) {
    return existing;
  }

  const id = newRequestId();
  const promise = new Promise<boolean>((resolve) => {
    pendingApprovals.set(id, { dedupKey, settle: resolve });
  });
  approvalsByDedupKey.set(dedupKey, promise);

  const surface = await ensurePromptSurface();
  await withQueueLock(async () => {
    const queue = await readPromptQueue();
    const entry: QueuedPrompt = { id, host, capability, surface };
    if (detail !== undefined) {
      entry.detail = detail;
    }
    queue.push(entry);
    await writePromptQueue(queue);
  });

  return promise;
}

export async function answerPrompt(
  id: string,
  condition: GrantCondition,
  durationSeconds?: number,
): Promise<void> {
  const answered = await withQueueLock(async () => {
    const queue = await readPromptQueue();
    const found = queue.find((entry) => entry.id === id);
    if (found === undefined) {
      return undefined;
    }
    // Build the grant before dequeuing so an invalid custom duration leaves
    // the prompt answerable instead of stranding the requester unsettled.
    const grant: Grant | null =
      condition === 'single'
        ? null
        : makeGrant(found.capability, condition, nowSeconds(), durationSeconds);
    await writePromptQueue(queue.filter((entry) => entry.id !== id));
    return { queued: found, grant };
  });
  if (answered === undefined) {
    console.warn(`autograph: answer for unknown prompt ${id}`);
    return;
  }
  if (answered.grant !== null) {
    const active = await getActiveProfile();
    if (active !== null) {
      await setGrant(active.pubkey, answered.queued.host, answered.grant);
    }
  }
  settleApproval(id, condition !== 'no');
  await closePromptSurfaceIfIdle();
}

async function closePromptSurfaceIfIdle(): Promise<void> {
  if (promptSurface === null) {
    return;
  }
  const queue = await readPromptQueue();
  if (queue.length > 0) {
    return;
  }
  const surface = await promptSurface;
  promptSurface = null;
  if (surface !== null) {
    await closeSurface(surface, 'prompt surface');
  }
}

export async function handlePromptSurfaceClosed(
  closed: SurfaceHandle,
): Promise<void> {
  if (promptSurface === null) {
    return;
  }
  const surface = await promptSurface;
  if (surface === null || !isSameSurface(surface, closed)) {
    return;
  }
  promptSurface = null;
  const queue = await withQueueLock(async () => {
    const entries = await readPromptQueue();
    await writePromptQueue([]);
    return entries;
  });
  for (const entry of queue) {
    settleApproval(entry.id, false);
  }
}

// Unlock-on-demand: a locked vault opens the unlock page on its own surface
// and every waiting request shares one outcome, mirroring the prompt surface.
interface PendingUnlock {
  promise: Promise<boolean>;
  settle: (unlocked: boolean) => void;
}

let pendingUnlock: PendingUnlock | null = null;
let unlockSurface: Promise<SurfaceHandle | null> | null = null;

function settleUnlock(unlocked: boolean): void {
  if (pendingUnlock === null) {
    return;
  }
  const pending = pendingUnlock;
  pendingUnlock = null;
  pending.settle(unlocked);
}

async function requestUnlock(): Promise<boolean> {
  if (pendingUnlock === null) {
    let settle: (unlocked: boolean) => void = () => undefined;
    const promise = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    pendingUnlock = { promise, settle };
    unlockSurface = createExtensionSurface(
      '/unlock.html',
      UNLOCK_WINDOW_WIDTH,
      UNLOCK_WINDOW_HEIGHT,
    );
    const surface = await unlockSurface;
    await writeUnlockRequest({ surface });
  }
  return pendingUnlock.promise;
}

async function finishUnlock(): Promise<void> {
  settleUnlock(true);
  await clearUnlockRequest();
  if (unlockSurface === null) {
    return;
  }
  const surface = await unlockSurface;
  unlockSurface = null;
  if (surface !== null) {
    await closeSurface(surface, 'unlock surface');
  }
}

export async function handleUnlockSurfaceClosed(
  closed: SurfaceHandle,
): Promise<void> {
  if (unlockSurface === null) {
    return;
  }
  const surface = await unlockSurface;
  if (surface === null || !isSameSurface(surface, closed)) {
    return;
  }
  unlockSurface = null;
  settleUnlock(false);
  await clearUnlockRequest();
}

async function executeRequest(request: BackgroundRequest): Promise<unknown> {
  const active = await getActiveProfile();
  if (active === null) {
    throw new Error('no active profile');
  }
  const now = nowSeconds();
  const grant = await getGrant(active.pubkey, request.host, now);
  const decision = decideCapability(grant, request.type, now);
  if (decision === 'deny') {
    throw new Error(`${request.host} is denied ${request.type}`);
  }
  if (decision === 'ask') {
    const allowed = await promptForCapability(
      request.host,
      request.type,
      signEventDetail(request),
    );
    if (!allowed) {
      throw new Error(`insufficient permissions for ${request.type}`);
    }
  }
  const handler = DISPATCH[request.type];
  const context: ExecutionContext = {
    pubkey: active.pubkey,
    profile: active.profile,
    params: request.params,
    secretKey: null,
  };
  if (!handler.needsSecret) {
    return handler.execute(context);
  }
  if (!(await isUnlocked())) {
    const unlocked = await requestUnlock();
    if (!unlocked) {
      throw new VaultLockedError();
    }
  }
  const secretKey = await decryptSecret(active.profile.encryptedKey);
  return withSecretKey(secretKey, (sk) =>
    handler.execute({ ...context, secretKey: sk }),
  );
}

function signEventDetail(
  request: BackgroundRequest,
): SignEventDetail | undefined {
  if (request.type !== 'signEvent' || !isSignEventParams(request.params)) {
    return undefined;
  }
  return {
    kind: request.params.event.kind,
    contentPreview: contentPreview(request.params.event.content),
  };
}

export async function handleBackgroundRequest(
  request: BackgroundRequest,
): Promise<BackgroundResponse> {
  try {
    return { response: await executeRequest(request) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function handleUiMessage(
  message: UiMessage,
): Promise<BackgroundResponse> {
  try {
    switch (message.action) {
      case 'answerPrompt':
        await answerPrompt(
          message.id,
          message.condition,
          message.durationSeconds,
        );
        break;
      case 'unlock':
        await unlockVault(message.passphrase);
        await finishUnlock();
        break;
      case 'createVault':
        await initializeVault(message.passphrase);
        await finishUnlock();
        break;
      case 'lock':
        await lockVault();
        clearConversationKeyCache();
        break;
    }
    return { response: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export default defineBackground(() => {
  browser.runtime.onStartup.addListener(() => {
    void resetPromptState();
  });
  browser.runtime.onInstalled.addListener(() => {
    void resetPromptState();
  });
  const windows = windowsApi();
  if (windows !== undefined) {
    windows.onRemoved.addListener((windowId) => {
      void handlePromptSurfaceClosed({ kind: 'window', id: windowId });
      void handleUnlockSurfaceClosed({ kind: 'window', id: windowId });
    });
  }
  // tabs.onRemoved fires for every tab in the browser; the handlers ignore
  // anything that is not the tracked surface, so dismissal keeps denying
  // everything on Android exactly as closing the popup window does.
  browser.tabs.onRemoved.addListener((tabId) => {
    void handlePromptSurfaceClosed({ kind: 'tab', id: tabId });
    void handleUnlockSurfaceClosed({ kind: 'tab', id: tabId });
  });
  const extensionOrigin = browser.runtime.getURL('');
  // sendResponse + `return true` is the one response mechanism native to
  // both Chromium and Firefox; returning a Promise only works behind the
  // webextension-polyfill, which WXT no longer ships.
  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      // onMessage is shared with the content script; UI messages are only
      // honored from the extension's own pages.
      if (isUiMessage(message)) {
        if (
          sender.url === undefined ||
          !sender.url.startsWith(extensionOrigin)
        ) {
          return;
        }
        void handleUiMessage(message).then((response) => {
          sendResponse(response);
        });
        return true;
      }
      if (!isBackgroundRequest(message)) {
        return;
      }
      void handleBackgroundRequest(message).then((response) => {
        sendResponse(response);
      });
      return true;
    },
  );
});
