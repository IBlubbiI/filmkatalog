import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Movie, MoviesDoc } from '../types';
import { discFormatRank, aggregateBadges } from './format';

export interface NamedCount {
  name: string;
  count: number;
}

export interface DiscoverCast {
  name: string;
  character: string | null;
  profile: string | null;
}
export interface CollectionPart {
  tmdbId: number;
  title: string;
  year: string | null;
  poster: string | null;
  type?: 'movie' | 'tv';
  future?: boolean; // Erstveröffentlichung liegt noch in der Zukunft (sonst: schon erschienen)
  // Detailinfos (nur für nicht besessene Titel gefüllt) – für die Entdecken-Seite
  overview?: string | null;
  rating?: number | null;
  runtime?: number | null;
  seasons?: number | null;
  backdrop?: string | null;
  cast?: DiscoverCast[];
}
export type Collections = Record<string, { name: string; parts: CollectionPart[] }>;
export type CollectionExtras = Record<string, CollectionPart[]>;

interface DataState {
  doc: MoviesDoc | null;
  movies: Movie[];
  byId: Map<string, Movie>;
  boxes: Map<string, Movie[]>; // boxKey -> Filme (nur echte Boxen mit > 1 Film)
  byUniverse: Map<string, Movie[]>; // universe -> alle Filme dieser Reihe/dieses Universums
  groups: Map<string, Movie[]>; // groupId -> Ausgaben desselben Films (Primär zuerst)
  groupBadges: Map<string, string[]>; // primaryId -> Badges über alle Ausgaben
  uniqueCount: number; // Anzahl eigenständiger Titel (Ausgaben zusammengefasst)
  directors: NamedCount[];
  franchises: NamedCount[];
  labels: NamedCount[]; // normalisierte Studios/Vertriebe
  decades: string[];
  mainGenres: string[]; // kanonische Hauptgenres (saubere Chip-Liste)
  categories: string[]; // übergeordnete Kategorien (Marvel, DC, …)
  aspectRatios: string[]; // Bildformate, nach Seitenverhältnis sortiert (schmal → breit)
  collections: Collections; // TMDB-Filmreihen (id -> Teile) für die Sammlung-Ansicht
  collectionExtras: CollectionExtras; // kuratierte Zusatztitel je Reihe (Ableger/Spinoffs)
  discoverById: Map<number, CollectionPart>; // nicht besessene Titel nach tmdbId (Entdecken-Seite)
  loading: boolean;
  error: string | null;
}

// Basistitel für die Gruppierung: nur Klammer-Zusätze wie "(Director's Cut)" entfernen,
// aber "– Staffel X" / "– Teil X" BEHALTEN (sonst würden GoT-Staffeln fälschlich mergen).
const baseTitle = (t: string) =>
  t.replace(/\s*\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim().toLowerCase();

// Gleiche TMDB-ID + gleicher Basistitel = dieselbe Film-Ausgabe. Ohne TMDB: eigene Gruppe.
const groupKeyOf = (m: Movie) => (m.tmdb?.tmdbId ? `t${m.tmdb.tmdbId}|${baseTitle(m.title)}` : `u${m.id}`);

const Ctx = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<MoviesDoc | null>(null);
  const [collections, setCollections] = useState<Collections>({});
  const [collectionExtras, setCollectionExtras] = useState<CollectionExtras>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}collections.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((c) => setCollections(c || {}))
      .catch(() => setCollections({}));
    fetch(`${import.meta.env.BASE_URL}collection-extras.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((c) => setCollectionExtras(c || {}))
      .catch(() => setCollectionExtras({}));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}movies.json`, { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: MoviesDoc) => {
        if (!cancelled) {
          setDoc(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e.message ?? e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<DataState>(() => {
    const movies = doc?.movies ?? [];
    const byId = new Map(movies.map((m) => [m.id, m]));

    const boxMap = new Map<string, Movie[]>();
    for (const m of movies) {
      if (!m.boxKey) continue;
      const arr = boxMap.get(m.boxKey) ?? [];
      arr.push(m);
      boxMap.set(m.boxKey, arr);
    }
    const boxes = new Map([...boxMap].filter(([, v]) => v.length > 1));

    // Ausgaben-Gruppen (gleicher Film, versch. Disc) über TMDB-ID + Basistitel
    const groupMap = new Map<string, Movie[]>();
    for (const m of movies) {
      const key = groupKeyOf(m);
      m.groupId = key;
      const arr = groupMap.get(key) ?? [];
      arr.push(m);
      groupMap.set(key, arr);
    }
    // Primär-Ausgabe (bestes Format) je Gruppe nach vorne sortieren
    for (const arr of groupMap.values()) {
      arr.sort(
        (a, b) =>
          discFormatRank(b.discFormat) - discFormatRank(a.discFormat) ||
          (a.year ?? 9999) - (b.year ?? 9999) ||
          a.id.localeCompare(b.id),
      );
    }
    const groupBadges = new Map<string, string[]>();
    for (const arr of groupMap.values()) groupBadges.set(arr[0].id, aggregateBadges(arr));

    const dirCount = new Map<string, number>();
    const franCount = new Map<string, number>();
    const labelCount = new Map<string, number>();
    const decadeSet = new Set<string>();
    const byUniverse = new Map<string, Movie[]>();
    for (const m of movies) {
      for (const d of m.directors) dirCount.set(d, (dirCount.get(d) ?? 0) + 1);
      if (m.franchise) franCount.set(m.franchise, (franCount.get(m.franchise) ?? 0) + 1);
      if (m.labelMain) labelCount.set(m.labelMain, (labelCount.get(m.labelMain) ?? 0) + 1);
      if (m.decade) decadeSet.add(m.decade);
      if (m.universe) {
        const arr = byUniverse.get(m.universe) ?? [];
        arr.push(m);
        byUniverse.set(m.universe, arr);
      }
    }
    const toSorted = (map: Map<string, number>): NamedCount[] =>
      [...map.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'));

    const decades = [...decadeSet].sort();
    // Alle vorkommenden Genre-Tags (nicht nur Hauptgenres) -> jeder Tag ist filterbar
    const mainGenres = [...new Set(movies.flatMap((m) => m.genresAll))].sort((a, b) => a.localeCompare(b, 'de'));
    const categories = [...new Set(movies.map((m) => m.category).filter((c): c is string => !!c))].sort((a, b) =>
      a.localeCompare(b, 'de'),
    );
    // Bildformate nach numerischem Seitenverhältnis (schmal -> breit)
    const ratioNum = (s: string) => {
      const [w, h] = s.split(':').map(Number);
      return h ? w / h : 99;
    };
    const aspectRatios = [...new Set(movies.map((m) => m.aspectRatio).filter((a): a is string => !!a))].sort(
      (a, b) => ratioNum(a) - ratioNum(b),
    );

    // Nachschlage-Index für die Entdecken-Detailseite (nicht besessene Titel nach tmdbId)
    const discoverById = new Map<number, CollectionPart>();
    for (const coll of Object.values(collections)) for (const p of coll.parts) if (!discoverById.has(p.tmdbId)) discoverById.set(p.tmdbId, p);
    for (const arr of Object.values(collectionExtras)) for (const p of arr) if (!discoverById.has(p.tmdbId)) discoverById.set(p.tmdbId, p);

    return {
      doc,
      movies,
      byId,
      boxes,
      byUniverse,
      groups: groupMap,
      groupBadges,
      uniqueCount: groupMap.size,
      directors: toSorted(dirCount),
      franchises: toSorted(franCount),
      labels: toSorted(labelCount),
      decades,
      mainGenres,
      categories,
      aspectRatios,
      collections,
      collectionExtras,
      discoverById,
      loading,
      error,
    };
  }, [doc, collections, collectionExtras, loading, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData muss innerhalb von <DataProvider> stehen');
  return v;
}
