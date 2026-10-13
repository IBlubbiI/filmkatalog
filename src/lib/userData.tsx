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
  order?: number; // manuelle Reihenfolge (ms-Skala wie `at`); fehlt → nach `at` (neueste zuerst)
}

// Bewertung eines einzelnen Autors (eigener Zeitstempel für den Geräte-Merge).
export interface AuthorRating {
  value: number | null; // 1.0–10.0, null = gelöscht (Tombstone)
  at: number;
}

// „Gesehen" eines einzelnen Autors: wie oft (count>=1) und wann zuletzt (at).
export interface AuthorSeen {
  count: number; // 0 = (nicht mehr) gesehen, >=1 = so oft gesehen
  at: number; // zuletzt gesehen (ms)
}

// Vom Nutzer in der App gepflegte Daten (auf dem Gerät gespeichert).
export interface UserEntry {
  seenBy?: Record<string, AuthorSeen>; // „gesehen" je Person (Thomas/Hannah/…) – Quelle der Wahrheit
  // Aggregat-Felder (aus seenBy abgeleitet) – für Katalog-Badge/-Filter/-Sortierung & Alt-Daten:
  seen?: boolean; // hat irgendjemand gesehen?
  seenAt?: number; // zuletzt von irgendjemandem gesehen (ms)
  watchCount?: number; // Summe aller Ansichten (Haushalt)
  rating?: number | null; // Gesamt-/Durchschnittswertung (für Katalog-Filter & -Sortierung)
  ratings?: Record<string, AuthorRating>; // Bewertung je Autor (Thomas/Hannah/…)
  notes?: Note[]; // Gedanken/Kommentare zum Film (mit Autor)
  updatedAt?: number; // Zeitstempel (ms) für Merge der Skalar-Felder zwischen Geräten
}
export type UserDataMap = Record<string, UserEntry>;

const activeNotes = (e?: UserEntry) => (e?.notes ?? []).filter((n) => !n.deleted);
// Durchschnitt der Autoren-Bewertungen (für die Gesamt-/Katalog-Wertung).
const avgRating = (ratings?: Record<string, AuthorRating>): number | null => {
  const vals = Object.values(ratings ?? {})
    .map((r) => r.value)
    .filter((v): v is number => v != null);
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
};
const hasAuthorRating = (e?: UserEntry) => Object.values(e?.ratings ?? {}).some((r) => r.value != null);

// Aggregate aus den „gesehen je Person"-Daten.
const anySeen = (sb?: Record<string, AuthorSeen>) => Object.values(sb ?? {}).some((s) => (s.count ?? 0) > 0);
const totalViews = (sb?: Record<string, AuthorSeen>) => Object.values(sb ?? {}).reduce((n, s) => n + Math.max(0, s.count ?? 0), 0);
const lastSeenAt = (sb?: Record<string, AuthorSeen>) =>
  Object.values(sb ?? {})
    .filter((s) => (s.count ?? 0) > 0)
    .reduce((m, s) => Math.max(m, s.at ?? 0), 0);
// Aggregat-Felder (seen/watchCount/seenAt) aus seenBy neu berechnen; Alt-Werte bleiben, wenn seenBy leer ist.
const withSeenAggregates = (e: UserEntry): UserEntry => {
  if (!e.seenBy || !Object.keys(e.seenBy).length) return e;
  return { ...e, seen: anySeen(e.seenBy), watchCount: totalViews(e.seenBy), seenAt: lastSeenAt(e.seenBy) || undefined };
};

const hasData = (e: UserEntry) => !!e && (e.seen || e.rating != null || !!e.watchCount || activeNotes(e).length > 0 || hasAuthorRating(e) || anySeen(e.seenBy));
const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const KEY = 'filmkatalog.userdata.v1';

interface Ctx {
  data: UserDataMap;
  entry: (id: string) => UserEntry;
  setRating: (id: string, rating: number | null) => void;
  authorRatings: (id: string) => Record<string, AuthorRating>; // Bewertungen je Autor
  setAuthorRating: (id: string, author: string, value: number) => void;
  clearAuthorRating: (id: string, author: string) => void;
  authorSeen: (id: string) => Record<string, AuthorSeen>; // „gesehen" je Person
  toggleSeen: (id: string, author: string) => void; // gesehen-Status einer Person umschalten
  setAuthorWatchCount: (id: string, author: string, n: number) => void; // „×-gesehen" einer Person setzen
  notes: (id: string) => Note[]; // aktive Notizen in Anzeige-Reihenfolge
  addNote: (id: string, author: string, text: string) => void;
  editNote: (id: string, noteId: string, text: string, author?: string) => void;
  deleteNote: (id: string, noteId: string) => void;
  reorderNotes: (id: string, orderedNoteIds: string[]) => void; // neue Reihenfolge (von oben)
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

  const setRating = useCallback((id: string, rating: number | null) => patch(id, { rating }), [patch]);

  // Bewertung je Autor (eigener Zeitstempel; Gesamtwertung = Durchschnitt).
  const authorRatings = useCallback((id: string) => dataRef.current[id]?.ratings ?? {}, []);
  const setAuthorRating = useCallback((id: string, author: string, value: number) => {
    setData((d) => {
      const e = d[id] ?? {};
      const ratings = { ...(e.ratings ?? {}), [author]: { value, at: Date.now() } };
      return { ...d, [id]: { ...e, ratings, rating: avgRating(ratings), updatedAt: Date.now() } };
    });
  }, []);
  const clearAuthorRating = useCallback((id: string, author: string) => {
    setData((d) => {
      const e = d[id];
      if (!e?.ratings) return d;
      const ratings = { ...e.ratings, [author]: { value: null, at: Date.now() } }; // Tombstone
      return { ...d, [id]: { ...e, ratings, rating: avgRating(ratings), updatedAt: Date.now() } };
    });
  }, []);
  // „Gesehen" je Person (eigener Zeitstempel; Aggregate seen/watchCount/seenAt werden abgeleitet).
  const authorSeen = useCallback((id: string) => dataRef.current[id]?.seenBy ?? {}, []);
  const toggleSeen = useCallback((id: string, author: string) => {
    setData((d) => {
      const e = d[id] ?? {};
      const cur = e.seenBy?.[author];
      const nowSeen = !(cur && cur.count > 0);
      const entry: AuthorSeen = nowSeen ? { count: Math.max(1, cur?.count ?? 0) || 1, at: Date.now() } : { count: 0, at: cur?.at ?? Date.now() };
      const seenBy = { ...(e.seenBy ?? {}), [author]: entry };
      return { ...d, [id]: withSeenAggregates({ ...e, seenBy, updatedAt: Date.now() }) };
    });
  }, []);
  const setAuthorWatchCount = useCallback((id: string, author: string, n: number) => {
    setData((d) => {
      const e = d[id] ?? {};
      const prev = e.seenBy?.[author]?.count ?? 0;
      const count = Math.max(0, n);
      // Hochzählen = erneut gesehen → Datum aktualisieren; sonst alten Zeitstempel behalten.
      const at = count > prev ? Date.now() : e.seenBy?.[author]?.at ?? Date.now();
      const seenBy = { ...(e.seenBy ?? {}), [author]: { count, at } };
      return { ...d, [id]: withSeenAggregates({ ...e, seenBy, updatedAt: Date.now() }) };
    });
  }, []);

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
    // Nach manueller Reihenfolge (order), sonst nach Erstellzeit – jeweils absteigend (neueste/oben zuerst).
    (id: string) => activeNotes(dataRef.current[id]).sort((a, b) => (b.order ?? b.at) - (a.order ?? a.at)),
    [],
  );
  // Neue Reihenfolge speichern: order in ms-Skala wie `at`, damit neue Notizen (at≈jetzt)
  // automatisch oben einsortiert werden, ohne die manuelle Ordnung zu stören.
  const reorderNotes = useCallback((id: string, orderedNoteIds: string[]) => {
    const base = Date.now();
    const pos = new Map(orderedNoteIds.map((nid, i) => [nid, base - i]));
    setData((d) => {
      const e = d[id];
      if (!e?.notes) return d;
      return { ...d, [id]: { ...e, notes: e.notes.map((n) => (pos.has(n.id) ? { ...n, order: pos.get(n.id)!, updatedAt: Date.now() } : n)) } };
    });
  }, []);

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
    // Bewertungen je Autor zusammenführen (neuester at gewinnt).
    const mergeRatings = (a: Record<string, AuthorRating> = {}, b: Record<string, AuthorRating> = {}): Record<string, AuthorRating> => {
      const m: Record<string, AuthorRating> = { ...a };
      for (const [author, r] of Object.entries(b)) {
        if (!m[author] || (r.at ?? 0) > (m[author].at ?? 0)) m[author] = r;
      }
      return m;
    };
    // „Gesehen" je Person zusammenführen (neuester at gewinnt).
    const mergeSeenBy = (a: Record<string, AuthorSeen> = {}, b: Record<string, AuthorSeen> = {}): Record<string, AuthorSeen> => {
      const m: Record<string, AuthorSeen> = { ...a };
      for (const [author, s] of Object.entries(b)) {
        if (!m[author] || (s.at ?? 0) > (m[author].at ?? 0)) m[author] = s;
      }
      return m;
    };
    for (const id of new Set([...Object.keys(local), ...Object.keys(remote || {})])) {
      const l = local[id];
      const r = (remote || {})[id];
      if (!r) continue;
      if (!l) {
        merged[id] = r;
        continue;
      }
      // Skalar-Felder: neuerer entry.updatedAt gewinnt. Notizen & Bewertungen: Vereinigung je ID/Autor.
      const base = (r.updatedAt ?? 0) > (l.updatedAt ?? 0) ? r : l;
      const notes = mergeNotes(l.notes, r.notes);
      const ratings = mergeRatings(l.ratings, r.ratings);
      const seenBy = mergeSeenBy(l.seenBy, r.seenBy);
      let out: UserEntry = { ...base };
      if (notes.length) out.notes = notes;
      else delete out.notes;
      if (Object.keys(ratings).length) {
        out.ratings = ratings;
        out.rating = avgRating(ratings); // Gesamtwertung aus den zusammengeführten Autoren-Bewertungen
      }
      if (Object.keys(seenBy).length) {
        out.seenBy = seenBy;
        out = withSeenAggregates(out); // seen/watchCount/seenAt aus zusammengeführten „gesehen"-Daten
      }
      merged[id] = out;
    }
    setData(merged);
    return merged;
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      data,
      entry: (id) => data[id] ?? {},
      setRating,
      authorRatings,
      setAuthorRating,
      clearAuthorRating,
      authorSeen,
      toggleSeen,
      setAuthorWatchCount,
      notes,
      addNote,
      editNote,
      deleteNote,
      reorderNotes,
      count: Object.values(data).filter(hasData).length,
      exportJSON,
      importJSON,
      clearAll,
      snapshot,
      mergeRemote,
    }),
    [data, setRating, authorRatings, setAuthorRating, clearAuthorRating, authorSeen, toggleSeen, setAuthorWatchCount, notes, addNote, editNote, deleteNote, reorderNotes, exportJSON, importJSON, clearAll, snapshot, mergeRemote],
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useUserData(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('useUserData muss innerhalb von <UserDataProvider> stehen');
  return v;
}
