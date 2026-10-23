// Small per-device preferences (theme, text size, last household). Storage can be unavailable (private mode,
// blocked site data), so every access is guarded and the app works without it.

const PREFIX = "splitwisee.";

export function readPreference(key, fallback = null) {
  try {
    return localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, String(value));
  } catch {
    // Preferences are a convenience only.
  }
}
