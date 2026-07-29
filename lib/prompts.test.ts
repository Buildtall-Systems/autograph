import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  CONTENT_PREVIEW_MAX_CHARS,
  clearUnlockRequest,
  contentPreview,
  listQueuedPrompts,
  readUnlockRequest,
  watchPromptQueue,
  writePromptQueue,
  writeUnlockRequest,
  type QueuedPrompt,
} from './prompts';

const PROMPT: QueuedPrompt = {
  id: 'abc123',
  host: 'drss.io',
  capability: 'signEvent',
  surface: { kind: 'window', id: 7 },
  detail: { kind: 1, contentPreview: 'hello' },
};

describe('prompt queue storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('round-trips the queue through storage', async () => {
    expect(await listQueuedPrompts()).toEqual([]);
    await writePromptQueue([PROMPT]);
    expect(await listQueuedPrompts()).toEqual([PROMPT]);
  });

  it('notifies watchers when the queue changes', async () => {
    const seen: QueuedPrompt[][] = [];
    watchPromptQueue((queue) => {
      seen.push(queue);
    });
    await writePromptQueue([PROMPT]);
    await expect.poll(() => seen.length).toBeGreaterThan(0);
    expect(seen[0]).toEqual([PROMPT]);
  });

  it('round-trips the unlock request through storage', async () => {
    expect(await readUnlockRequest()).toBeNull();
    await writeUnlockRequest({ surface: { kind: 'tab', id: 42 } });
    expect(await readUnlockRequest()).toEqual({
      surface: { kind: 'tab', id: 42 },
    });
    await clearUnlockRequest();
    expect(await readUnlockRequest()).toBeNull();
  });
});

describe('contentPreview', () => {
  it('passes short content through unchanged', () => {
    expect(contentPreview('hello nostr')).toBe('hello nostr');
  });

  it('keeps content at exactly the limit unchanged', () => {
    const exact = 'x'.repeat(CONTENT_PREVIEW_MAX_CHARS);
    expect(contentPreview(exact)).toBe(exact);
  });

  it('truncates long content with an ellipsis', () => {
    const long = 'y'.repeat(CONTENT_PREVIEW_MAX_CHARS + 1);
    const preview = contentPreview(long);
    expect(preview).toHaveLength(CONTENT_PREVIEW_MAX_CHARS + 1);
    expect(preview.endsWith('…')).toBe(true);
  });
});
