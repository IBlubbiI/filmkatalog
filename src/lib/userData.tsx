import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// Vom Nutzer in der App gepflegte Daten (auf dem Gerät gespeichert).
export interface UserEntry {
  seen?: boolean;
  rating?: number | null; // 1.0–10.0, eine Nachkommastelle
  watchCount?: number; // wie oft gesehen (>=1)
}
export type UserDataMap = Record<string, UserEntry>;

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
    setData((d) => {
      const next: UserEntry = { ...d[id], ...p };
      // leere Einträge wieder entfernen
      if (!next.seen && (next.rating == null) && !next.watchCount) {
        const { [id]: _drop, ...rest } = d;
        return rest;
      }
      return { ...d, [id]: next };
    });
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

  const value = useMemo<Ctx>(
    () => ({
      data,
      entry: (id) => data[id] ?? {},
      setSeen,
      setRating,
      setWatchCount,
      count: Object.keys(data).length,
      exportJSON,
      importJSON,
      clearAll,
    }),
    [data, setSeen, setRating, setWatchCount, exportJSON, importJSON, clearAll],
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useUserData(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('useUserData muss innerhalb von <UserDataProvider> stehen');
  return v;
}
