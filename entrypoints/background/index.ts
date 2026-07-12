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
let promptWindow: Promise<number | null> | null = null;
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
  promptWindow = null;
  for (const [id] of pendingApprovals) {
    settleApproval(id, false);
  }
  await withQueueLock(() => writePromptQueue([]));
  unlockWindow = null;
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

async function createExtensionWindow(
  path: PublicPath,
  width: number,
  height: number,
): Promise<number | null> {
  const created = await browser.windows.create({
    url: browser.runtime.getURL(path),
    type: 'popup',
    width,
    height,
  });
  return created?.id ?? null;
}

function ensurePromptWindow(): Promise<number | null> {
  promptWindow ??= createExtensionWindow(
    '/prompt.html',
    PROMPT_WINDOW_WIDTH,
    PROMPT_WINDOW_HEIGHT,
  );
  return promptWindow;
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

  const windowId = await ensurePromptWindow();
  await withQueueLock(async () => {
    const queue = await readPromptQueue();
    const entry: QueuedPrompt = { id, host, capability, windowId };
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
  await closePromptWindowIfIdle();
}

async function closePromptWindowIfIdle(): Promise<void> {
  if (promptWindow === null) {
    return;
  }
  const queue = await readPromptQueue();
  if (queue.length > 0) {
    return;
  }
  const windowId = await promptWindow;
  promptWindow = null;
  if (windowId !== null) {
    try {
      await browser.windows.remove(windowId);
    } catch (error) {
      console.warn('autograph: prompt window already gone', error);
    }
  }
}

export async function handlePromptWindowClosed(
  closedWindowId: number,
): Promise<void> {
  if (promptWindow === null) {
    return;
  }
  const windowId = await promptWindow;
  if (windowId !== closedWindowId) {
    return;
  }
  promptWindow = null;
  const queue = await withQueueLock(async () => {
    const entries = await readPromptQueue();
    await writePromptQueue([]);
    return entries;
  });
  for (const entry of queue) {
    settleApproval(entry.id, false);
  }
}

// Unlock-on-demand: a locked vault opens the unlock page in its own window
// and every waiting request shares one outcome, mirroring the prompt window.
interface PendingUnlock {
  promise: Promise<boolean>;
  settle: (unlocked: boolean) => void;
}

let pendingUnlock: PendingUnlock | null = null;
let unlockWindow: Promise<number | null> | null = null;

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
    unlockWindow = createExtensionWindow(
      '/unlock.html',
      UNLOCK_WINDOW_WIDTH,
      UNLOCK_WINDOW_HEIGHT,
    );
    const windowId = await unlockWindow;
    await writeUnlockRequest({ windowId });
  }
  return pendingUnlock.promise;
}

async function finishUnlock(): Promise<void> {
  settleUnlock(true);
  await clearUnlockRequest();
  if (unlockWindow === null) {
    return;
  }
  const windowId = await unlockWindow;
  unlockWindow = null;
  if (windowId !== null) {
    try {
      await browser.windows.remove(windowId);
    } catch (error) {
      console.warn('autograph: unlock window already gone', error);
    }
  }
}

export async function handleUnlockWindowClosed(
  closedWindowId: number,
): Promise<void> {
  if (unlockWindow === null) {
    return;
  }
  const windowId = await unlockWindow;
  if (windowId !== closedWindowId) {
    return;
  }
  unlockWindow = null;
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
  browser.windows.onRemoved.addListener((windowId) => {
    void handlePromptWindowClosed(windowId);
    void handleUnlockWindowClosed(windowId);
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
