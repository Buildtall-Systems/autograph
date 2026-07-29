import type { Capability } from './protocol';

export const PROMPT_QUEUE_STORAGE_KEY = 'promptQueue';
export const UNLOCK_REQUEST_STORAGE_KEY = 'unlockRequest';
export const CONTENT_PREVIEW_MAX_CHARS = 200;

export interface SignEventDetail {
  kind: number;
  contentPreview: string;
}

// Prompt and unlock pages open as popup windows where the windows API exists
// and as tabs where it does not (Firefox for Android). The kind travels with
// the id so teardown reaches for the same API that opened the surface.
export type SurfaceKind = 'window' | 'tab';

export interface SurfaceHandle {
  kind: SurfaceKind;
  id: number;
}

export interface QueuedPrompt {
  id: string;
  host: string;
  capability: Capability;
  surface: SurfaceHandle | null;
  detail?: SignEventDetail;
}

export interface UnlockRequest {
  surface: SurfaceHandle | null;
}

export function contentPreview(content: string): string {
  if (content.length <= CONTENT_PREVIEW_MAX_CHARS) {
    return content;
  }
  return `${content.slice(0, CONTENT_PREVIEW_MAX_CHARS)}…`;
}

export async function readPromptQueue(): Promise<QueuedPrompt[]> {
  const stored = await browser.storage.local.get(PROMPT_QUEUE_STORAGE_KEY);
  return (stored[PROMPT_QUEUE_STORAGE_KEY] as QueuedPrompt[] | undefined) ?? [];
}

export async function writePromptQueue(queue: QueuedPrompt[]): Promise<void> {
  await browser.storage.local.set({ [PROMPT_QUEUE_STORAGE_KEY]: queue });
}

export async function listQueuedPrompts(): Promise<QueuedPrompt[]> {
  return readPromptQueue();
}

export function watchPromptQueue(
  onChange: (queue: QueuedPrompt[]) => void,
): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return;
    }
    const change = changes[PROMPT_QUEUE_STORAGE_KEY];
    if (change === undefined) {
      return;
    }
    onChange((change.newValue as QueuedPrompt[] | undefined) ?? []);
  });
}

export async function readUnlockRequest(): Promise<UnlockRequest | null> {
  const stored = await browser.storage.local.get(UNLOCK_REQUEST_STORAGE_KEY);
  return (
    (stored[UNLOCK_REQUEST_STORAGE_KEY] as UnlockRequest | undefined) ?? null
  );
}

export async function writeUnlockRequest(
  request: UnlockRequest,
): Promise<void> {
  await browser.storage.local.set({ [UNLOCK_REQUEST_STORAGE_KEY]: request });
}

export async function clearUnlockRequest(): Promise<void> {
  await browser.storage.local.remove(UNLOCK_REQUEST_STORAGE_KEY);
}
