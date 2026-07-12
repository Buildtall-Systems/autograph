import {
  generateProfileKey,
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
  type GrantCondition,
} from '@/lib/permissions';
import {
  addProfile,
  getActiveProfile,
  getGrant,
  setActivePubkey,
  setGrant,
  type Profile,
} from '@/lib/profiles';
import {
  isBackgroundRequest,
  isCipherParams,
  isSignEventParams,
  newRequestId,
  type BackgroundRequest,
  type BackgroundResponse,
  type Capability,
} from '@/lib/protocol';
import {
  VaultLockedError,
  decryptSecret,
  encryptSecret,
  initializeVault,
  isUnlocked,
  unlockVault,
  vaultExists,
} from '@/lib/vault';

export const PROMPT_WINDOW_WIDTH = 400;
export const PROMPT_WINDOW_HEIGHT = 520;
const PROMPT_QUEUE_STORAGE_KEY = 'promptQueue';
const MS_PER_SECOND = 1000;

export interface QueuedPrompt {
  id: string;
  host: string;
  capability: Capability;
  windowId: number | null;
}

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

async function readPromptQueue(): Promise<QueuedPrompt[]> {
  const stored = await browser.storage.local.get(PROMPT_QUEUE_STORAGE_KEY);
  return (stored[PROMPT_QUEUE_STORAGE_KEY] as QueuedPrompt[] | undefined) ?? [];
}

async function writePromptQueue(queue: QueuedPrompt[]): Promise<void> {
  await browser.storage.local.set({ [PROMPT_QUEUE_STORAGE_KEY]: queue });
}

export async function listQueuedPrompts(): Promise<QueuedPrompt[]> {
  return readPromptQueue();
}

export async function resetPromptState(): Promise<void> {
  promptWindow = null;
  for (const [id] of pendingApprovals) {
    settleApproval(id, false);
  }
  await withQueueLock(() => writePromptQueue([]));
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

async function createPromptWindow(): Promise<number | null> {
  const created = await browser.windows.create({
    url: browser.runtime.getURL('/prompt.html'),
    type: 'popup',
    width: PROMPT_WINDOW_WIDTH,
    height: PROMPT_WINDOW_HEIGHT,
  });
  return created?.id ?? null;
}

function ensurePromptWindow(): Promise<number | null> {
  promptWindow ??= createPromptWindow();
  return promptWindow;
}

export async function promptForCapability(
  host: string,
  capability: Capability,
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
    queue.push({ id, host, capability, windowId });
    await writePromptQueue(queue);
  });

  return promise;
}

export async function answerPrompt(
  id: string,
  condition: GrantCondition,
  durationSeconds?: number,
): Promise<void> {
  const queued = await withQueueLock(async () => {
    const queue = await readPromptQueue();
    const found = queue.find((entry) => entry.id === id);
    if (found !== undefined) {
      await writePromptQueue(queue.filter((entry) => entry.id !== id));
    }
    return found;
  });
  if (queued === undefined) {
    console.warn(`autograph: answer for unknown prompt ${id}`);
    return;
  }
  if (condition !== 'single') {
    const active = await getActiveProfile();
    if (active !== null) {
      await setGrant(
        active.pubkey,
        queued.host,
        makeGrant(queued.capability, condition, nowSeconds(), durationSeconds),
      );
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
    const allowed = await promptForCapability(request.host, request.type);
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
    throw new VaultLockedError();
  }
  const secretKey = await decryptSecret(active.profile.encryptedKey);
  return withSecretKey(secretKey, (sk) =>
    handler.execute({ ...context, secretKey: sk }),
  );
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

// Phase-3 scaffolding, removed in Phase 4 when real profile/grant UI exists:
// seeds a vault, a generated profile, and a forever grant at the highest
// capability level so `window.nostr` can be exercised from a page. Invoke
// from the background console: `await autographDevSeed('passphrase', 'host')`.
async function devSeed(passphrase: string, host: string): Promise<string> {
  if (await vaultExists()) {
    await unlockVault(passphrase);
  } else {
    await initializeVault(passphrase);
  }
  const { secretKey, pubkey } = generateProfileKey();
  const encryptedKey = await withSecretKey(secretKey, (sk) =>
    encryptSecret(sk),
  );
  await addProfile(pubkey, 'dev-seed', encryptedKey);
  await setActivePubkey(pubkey);
  await setGrant(
    pubkey,
    host,
    makeGrant('nip44.encrypt', 'forever', nowSeconds()),
  );
  return pubkey;
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
  });
  // sendResponse + `return true` is the one response mechanism native to
  // both Chromium and Firefox; returning a Promise only works behind the
  // webextension-polyfill, which WXT no longer ships.
  browser.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      if (!isBackgroundRequest(message)) {
        return;
      }
      void handleBackgroundRequest(message).then((response) => {
        sendResponse(response);
      });
      return true;
    },
  );
  (globalThis as { autographDevSeed?: typeof devSeed }).autographDevSeed =
    devSeed;
});
