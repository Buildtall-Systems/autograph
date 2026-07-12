import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

describe('test harness', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('round-trips a value through extension storage', async () => {
    await fakeBrowser.storage.local.set({ probe: 'iceberg' });
    const stored = await fakeBrowser.storage.local.get('probe');
    expect(stored.probe).toBe('iceberg');
  });
});
