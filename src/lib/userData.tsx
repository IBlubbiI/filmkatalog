import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// Vom Nutzer in der App gepflegte Daten (auf dem Gerät gespeichert).
export interface UserEntry {
  seen?: boolean;
  rating?: number | null; // 1.0–10.0, eine Nachkommastelle
  watchCount?: number; // wie oft gesehen (>=1)
  updatedAt?: number; // Zeitstempel (ms) für Merge zwischen Geräten
}
export type UserDataMap = Record<string, UserEntry>;

const hasData = (e: UserEntry) => !!e && (e.seen || e.rating != null || !!e.watchCount);

const KEY = 'filmkatalog.userdata.v1';

interface Ctx {
  data: UserDataMap;
  entry: (id: string) => UserEntry;
  setSeen: (id: string, seen: boolean) => void;
  setRating: (id: string, rating: number | null) => void;
  setWatchCount: (id: string, n: number) => void;
  count: number; // Anzahl Filme mit Daten
  exportJSON: () => void;
  importJSON: (file: File) => Promise<{ ok: boolean; msg: string }>;
  clearAll: () => void;
  // für Geräte-Sync:
  snapshot: () => UserDataMap;
  mergeRemote: (remote: UserDataMap) => UserDataMap; // je Film neueren Zeitstempel behalten
}

const C = createContext<Ctx | null>(null);

function load(): UserDataMap {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function UserDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<UserDataMap>(load);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* Speicher evtl. voll/blockiert – ignorieren */
    }
  }, [data]);

  const patch = useCallback((id: string, p: Partial<UserEntry>) => {
    // Leere Einträge bleiben als "Tombstone" (mit Zeitstempel) erhalten, damit ein
    // Löschen auch beim Geräte-Merge greift.
    setData((d) => ({ ...d, [id]: { ...d[id], ...p, updatedAt: Date.now() } }));
  }, []);

  const setSeen = useCallback(
    (id: string, seen: boolean) => patch(id, { seen, watchCount: seen ? Math.max(1, dataRef.current[id]?.watchCount || 0) || 1 : 0 }),
    [patch],
  );
  const setRating = useCallback((id: string, rating: number | null) => patch(id, { rating }), [patch]);
  const setWatchCount = useCallback(
    (id: string, n: number) => patch(id, { watchCount: Math.max(0, n), seen: n > 0 ? true : dataRef.current[id]?.seen }),
    [patch],
  );

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data: dataRef.current }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `filmkatalog-bewertungen-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importJSON = useCallback(async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const incoming: UserDataMap = parsed.data ?? parsed;
      if (typeof incoming !== 'object' || incoming == null) return { ok: false, msg: 'Ungültige Datei.' };
      setData((d) => ({ ...d, ...incoming }));
      return { ok: true, msg: `${Object.keys(incoming).length} Einträge importiert.` };
    } catch (e) {
      return { ok: false, msg: 'Datei konnte nicht gelesen werden.' };
    }
  }, []);

  const clearAll = useCallback(() => setData({}), []);

  const snapshot = useCallback(() => dataRef.current, []);
  const mergeRemote = useCallback((remote: UserDataMap) => {
    const local = dataRef.current;
    const merged: UserDataMap = { ...local };
    for (const [id, r] of Object.entries(remote || {})) {
      const l = merged[id];
      if (!l || (r.updatedAt ?? 0) > (l.updatedAt ?? 0)) merged[id] = r;
    }
    setData(merged);
    return merged;
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      data,
      entry: (id) => data[id] ?? {},
      setSeen,
      setRating,
      setWatchCount,
      count: Object.values(data).filter(hasData).length,
      exportJSON,
      importJSON,
      clearAll,
      snapshot,
      mergeRemote,
    }),
    [data, setSeen, setRating, setWatchCount, exportJSON, importJSON, clearAll, snapshot, mergeRemote],
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useUserData(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('useUserData muss innerhalb von <UserDataProvider> stehen');
  return v;
}
