// Per-Viewer-Komfort (letzter Filter/Sortierung/Ansicht). Alles in try/catch:
// im Privat-Modus oder bei blockiertem Storage darf nichts crashen.

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignoriert */
  }
}
