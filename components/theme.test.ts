import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  DEFAULT_THEME,
  getStoredTheme,
  isTheme,
  setStoredTheme,
  THEME_STORAGE_KEY,
} from './theme';

describe('theme storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('defaults to buildtall-dark', async () => {
    expect(await getStoredTheme()).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toBe('buildtall-dark');
  });

  it('round-trips a stored theme', async () => {
    await setStoredTheme('buildtall-light');
    expect(await getStoredTheme()).toBe('buildtall-light');
  });

  it('falls back to the default on a corrupt stored value', async () => {
    await browser.storage.local.set({ [THEME_STORAGE_KEY]: 'iceberg' });
    expect(await getStoredTheme()).toBe(DEFAULT_THEME);
  });

  it('recognizes only the canonical themes', () => {
    expect(isTheme('buildtall-dark')).toBe(true);
    expect(isTheme('buildtall-light')).toBe(true);
    expect(isTheme('drss-legacy')).toBe(false);
    expect(isTheme(7)).toBe(false);
  });
});
