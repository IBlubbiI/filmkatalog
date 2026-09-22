import type { Movie } from '../types';

export type SeenValue = 'ja' | 'nein' | 'unbekannt';
export type FskValue = number | 'unbekannt';
export type HdrMode = 'any' | 'has' | 'dv';

export type GenreMode = 'or' | 'and';

export interface FilterState {
  discFormat: string[];
  native4kOnly: boolean;
  hdr: HdrMode;
  mainGenre: string[];
  genreMode: GenreMode;
  genreText: string;
  fsk: FskValue[];
  aspectRatio: string[]; // Bildformat, z. B. "1.85:1", "2.39:1", "unbekannt"
  type: ('Film' | 'Serie')[];
  director: string | null;
  franchise: string | null;
  category: string[];
  label: string[];
  decade: string[];
  runtimeMax: number | null;
  atmosOnly: boolean;
  extendedCutOnly: boolean;
  seen: SeenValue[];
}

export const DISC_FORMATS = ['DVD', 'Blu-ray', '4K UHD', '4K UHD + Blu-ray'];

export function emptyFilters(): FilterState {
  return {
    discFormat: [],
    native4kOnly: false,
    hdr: 'any',
    mainGenre: [],
    genreMode: 'or',
    genreText: '',
    fsk: [],
    aspectRatio: [],
    type: [],
    director: null,
    franchise: null,
    category: [],
    label: [],
    decade: [],
    runtimeMax: null,
    atmosOnly: false,
    extendedCutOnly: false,
    seen: [],
  };
}

const seenOf = (m: Movie): SeenValue => (m.seen === true ? 'ja' : m.seen === false ? 'nein' : 'unbekannt');

/** Ein Prädikat pro Filter-Dimension. */
export const DIMS: Record<string, (m: Movie, s: FilterState) => boolean> = {
  discFormat: (m, s) => s.discFormat.length === 0 || (!!m.discFormat && s.discFormat.includes(m.discFormat)),
  native4k: (m, s) => !s.native4kOnly || m.native4k === 'Ja',
  hdr: (m, s) => s.hdr === 'any' || (s.hdr === 'has' ? m.hasHdr : m.hasDolbyVision),
  // Matcht über das gesamte Genre-Set (Hauptgenre + Genres). ODER = mind. eines,
  // UND = alle ausgewählten (z. B. "Musical UND Drama").
  mainGenre: (m, s) => {
    if (s.mainGenre.length === 0) return true;
    const set = m.genresAll;
    return s.genreMode === 'and'
      ? s.mainGenre.every((g) => set.includes(g))
      : s.mainGenre.some((g) => set.includes(g));
  },
  genreText: (m, s) => {
    if (!s.genreText.trim()) return true;
    const q = s.genreText.toLowerCase();
    return [m.mainGenre, ...m.genres].some((g) => !!g && g.toLowerCase().includes(q));
  },
  fsk: (m, s) => s.fsk.length === 0 || s.fsk.includes(m.fsk == null ? 'unbekannt' : m.fsk),
  aspectRatio: (m, s) => s.aspectRatio.length === 0 || s.aspectRatio.includes(m.aspectRatio ?? 'unbekannt'),
  type: (m, s) => s.type.length === 0 || s.type.includes(m.type),
  director: (m, s) => !s.director || m.directors.includes(s.director),
  franchise: (m, s) => !s.franchise || m.franchise === s.franchise,
  category: (m, s) => s.category.length === 0 || (!!m.category && s.category.includes(m.category)),
  label: (m, s) => s.label.length === 0 || (!!m.labelMain && s.label.includes(m.labelMain)),
  decade: (m, s) => s.decade.length === 0 || (!!m.decade && s.decade.includes(m.decade)),
  runtime: (m, s) => s.runtimeMax == null || (m.runtime != null && m.runtime <= s.runtimeMax),
  atmos: (m, s) => !s.atmosOnly || m.atmos === 'Ja',
  extendedCut: (m, s) => !s.extendedCutOnly || m.extendedCut,
  seen: (m, s) => s.seen.length === 0 || s.seen.includes(seenOf(m)),
};

const DIM_KEYS = Object.keys(DIMS);

/** true, wenn der Film ALLE Dimensionen erfüllt (außer optional einer). */
export function matches(m: Movie, s: FilterState, except?: string): boolean {
  for (const k of DIM_KEYS) {
    if (k === except) continue;
    if (!DIMS[k](m, s)) return false;
  }
  return true;
}

export function applyFilters(movies: Movie[], s: FilterState): Movie[] {
  return movies.filter((m) => matches(m, s));
}

/** Anzahl aktiver Filter (für Badge am Filter-Button). */
export function activeCount(s: FilterState): number {
  let n = 0;
  n += s.discFormat.length;
  n += s.native4kOnly ? 1 : 0;
  n += s.hdr !== 'any' ? 1 : 0;
  n += s.mainGenre.length;
  n += s.genreText.trim() ? 1 : 0;
  n += s.fsk.length;
  n += s.aspectRatio.length;
  n += s.type.length;
  n += s.director ? 1 : 0;
  n += s.franchise ? 1 : 0;
  n += s.category.length;
  n += s.label.length;
  n += s.decade.length;
  n += s.runtimeMax != null ? 1 : 0;
  n += s.atmosOnly ? 1 : 0;
  n += s.extendedCutOnly ? 1 : 0;
  n += s.seen.length;
  return n;
}

/**
 * Facetten-Zähler: für eine Dimension die Trefferzahl je Option, gezählt gegen
 * die Menge, die alle ANDEREN aktiven Filter erfüllt (klassisches Facetten-Verhalten).
 */
export function facetCounts<T extends string | number>(
  movies: Movie[],
  s: FilterState,
  dimKey: string,
  valueOf: (m: Movie) => T | T[] | null,
): Map<T, number> {
  const counts = new Map<T, number>();
  for (const m of movies) {
    if (!matches(m, s, dimKey)) continue;
    const v = valueOf(m);
    if (v == null) continue;
    const arr = Array.isArray(v) ? v : [v];
    for (const x of arr) counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  return counts;
}
