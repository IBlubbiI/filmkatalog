import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// Eine Film-Notiz (mit Autor). Hat einen eigenen Zeitstempel, damit der Geräte-
// Merge Notizen einzeln zusammenführt (nie gegenseitig überschreibt).
export interface Note {
  id: string;
  author: string;
  text: string;
  at: number; // erstellt (ms)
  updatedAt: number; // für Merge
  deleted?: boolean; // Tombstone (gelöscht, aber für den Merge erhalten)
}

// Vom Nutzer in der App gepflegte Daten (auf dem Gerät gespeichert).
export interface UserEntry {
  seen?: boolean;
  rating?: number | null; // 1.0–10.0, eine Nachkommastelle
  watchCount?: number; // wie oft gesehen (>=1)
  notes?: Note[]; // Gedanken/Kommentare zum Film (mit Autor)
  updatedAt?: number; // Zeitstempel (ms) für Merge der Skalar-Felder zwischen Geräten
}
export type UserDataMap = Record<string, UserEntry>;

const activeNotes = (e?: UserEntry) => (e?.notes ?? []).filter((n) => !n.deleted);
const hasData = (e: UserEntry) => !!e && (e.seen || e.rating != null || !!e.watchCount || activeNotes(e).length > 0);
const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const KEY = 'filmkatalog.userdata.v1';

interface Ctx {
  data: UserDataMap;
  entry: (id: string) => UserEntry;
  setSeen: (id: string, seen: boolean) => void;
  setRating: (id: string, rating: number | null) => void;
  setWatchCount: (id: string, n: number) => void;
  notes: (id: string) => Note[]; // aktive Notizen, neueste zuerst
  addNote: (id: string, author: string, text: string) => void;
  editNote: (id: string, noteId: string, text: string, author?: string) => void;
  deleteNote: (id: string, noteId: string) => void;
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

  // Notizen tragen EIGENE Zeitstempel (kein Bump von entry.updatedAt), damit der
  // Geräte-Merge Skalar-Felder und Notizen unabhängig zusammenführt.
  const addNote = useCallback((id: string, author: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    const note: Note = { id: uuid(), author: author.trim() || 'Ich', text: t, at: Date.now(), updatedAt: Date.now() };
    setData((d) => ({ ...d, [id]: { ...d[id], notes: [...(d[id]?.notes ?? []), note] } }));
  }, []);
  const editNote = useCallback((id: string, noteId: string, text: string, author?: string) => {
    const t = text.trim();
    if (!t) return;
    setData((d) => {
      const e = d[id];
      if (!e?.notes) return d;
      return {
        ...d,
        [id]: { ...e, notes: e.notes.map((n) => (n.id === noteId ? { ...n, text: t, author: author?.trim() || n.author, updatedAt: Date.now() } : n)) },
      };
    });
  }, []);
  const deleteNote = useCallback((id: string, noteId: string) => {
    setData((d) => {
      const e = d[id];
      if (!e?.notes) return d;
      return { ...d, [id]: { ...e, notes: e.notes.map((n) => (n.id === noteId ? { ...n, deleted: true, updatedAt: Date.now() } : n)) } };
    });
  }, []);
  const notes = useCallback(
    (id: string) => activeNotes(dataRef.current[id]).sort((a, b) => b.at - a.at),
    [],
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
    // Notizen je ID zusammenführen (neuester updatedAt gewinnt) – nichts geht verloren.
    const mergeNotes = (a: Note[] = [], b: Note[] = []): Note[] => {
      const m = new Map<string, Note>();
      for (const n of [...a, ...b]) {
        const prev = m.get(n.id);
        if (!prev || (n.updatedAt ?? 0) > (prev.updatedAt ?? 0)) m.set(n.id, n);
      }
      return [...m.values()];
    };
    for (const id of new Set([...Object.keys(local), ...Object.keys(remote || {})])) {
      const l = local[id];
      const r = (remote || {})[id];
      if (!r) continue;
      if (!l) {
        merged[id] = r;
        continue;
      }
      // Skalar-Felder: neuerer entry.updatedAt gewinnt. Notizen: Vereinigung je ID.
      const base = (r.updatedAt ?? 0) > (l.updatedAt ?? 0) ? r : l;
      const notes = mergeNotes(l.notes, r.notes);
      const out: UserEntry = { ...base };
      if (notes.length) out.notes = notes;
      else delete out.notes;
      merged[id] = out;
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
      notes,
      addNote,
      editNote,
      deleteNote,
      count: Object.values(data).filter(hasData).length,
      exportJSON,
      importJSON,
      clearAll,
      snapshot,
      mergeRemote,
    }),
    [data, setSeen, setRating, setWatchCount, notes, addNote, editNote, deleteNote, exportJSON, importJSON, clearAll, snapshot, mergeRemote],
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useUserData(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('useUserData muss innerhalb von <UserDataProvider> stehen');
  return v;
}
