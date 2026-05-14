/**
 * Storage utilities for user preferences, auto-save, and sensitive data cleanup.
 * Uses localStorage with JSON serialization.
 */

const PREFS_KEY = 'lawmind_prefs';
const AUTO_SAVE_PREFIX = 'lawmind_autosave_';
const AUTO_SAVE_INTERVAL = 10_000; // 10 seconds

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  lastPage: string;
  lastSearchQuery: string;
  lastDocType: string;
}

const DEFAULT_PREFS: UserPreferences = {
  theme: 'light',
  lastPage: '/',
  lastSearchQuery: '',
  lastDocType: '',
};

/** Load user preferences from localStorage */
export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Save user preferences to localStorage */
export function savePreferences(prefs: Partial<UserPreferences>): void {
  const current = loadPreferences();
  const merged = { ...current, ...prefs };
  localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
}

/** Auto-save a form value with a given key */
export function autoSave(key: string, value: string): void {
  try {
    localStorage.setItem(AUTO_SAVE_PREFIX + key, JSON.stringify({
      value,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* quota exceeded, ignore */ }
}

/** Load auto-saved form value */
export function loadAutoSave(key: string): { value: string; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Clear auto-saved form value */
export function clearAutoSave(key: string): void {
  localStorage.removeItem(AUTO_SAVE_PREFIX + key);
}

/** Clear all auto-saved data */
export function clearAllAutoSaves(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(AUTO_SAVE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

/** Clear all sensitive data on logout */
export function clearSensitiveData(): void {
  // Clear auth data
  localStorage.removeItem('token');
  localStorage.removeItem('user');

  // Clear auto-saves (which may contain case details)
  clearAllAutoSaves();

  // Clear document drafts
  localStorage.removeItem('lawmind_doc_drafts');

  // Clear search history
  localStorage.removeItem('lawmind_search_history');

  // Keep preferences (theme, last page) - those aren't sensitive
}

/** Auto-save interval hook utility - returns an interval ID for cleanup */
export function startAutoSaveInterval(
  key: string,
  getValue: () => string,
  intervalMs: number = AUTO_SAVE_INTERVAL,
): number {
  return window.setInterval(() => {
    const value = getValue();
    if (value.trim()) {
      autoSave(key, value);
    }
  }, intervalMs);
}
