// Preferences and the room shortcut are optional. Blocked/full browser storage
// must never turn an authenticated snapshot or a committed move into a failure.
export const browserStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Optional preference. */
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Optional preference. */
    }
  },
};
