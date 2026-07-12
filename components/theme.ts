export const THEME_STORAGE_KEY = 'theme';

export const THEMES = ['buildtall-dark', 'buildtall-light'] as const;

export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'buildtall-dark';

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === 'string' && (THEMES as readonly string[]).includes(value)
  );
}

export async function getStoredTheme(): Promise<Theme> {
  const stored = await browser.storage.local.get(THEME_STORAGE_KEY);
  const value: unknown = stored[THEME_STORAGE_KEY];
  return isTheme(value) ? value : DEFAULT_THEME;
}

export async function setStoredTheme(theme: Theme): Promise<void> {
  await browser.storage.local.set({ [THEME_STORAGE_KEY]: theme });
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export async function initTheme(): Promise<void> {
  applyTheme(await getStoredTheme());
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return;
    }
    const change = changes[THEME_STORAGE_KEY];
    if (change === undefined) {
      return;
    }
    if (isTheme(change.newValue)) {
      applyTheme(change.newValue);
    }
  });
}
