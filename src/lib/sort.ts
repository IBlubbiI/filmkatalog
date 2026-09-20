import type { Movie } from '../types';

export type SortKey =
  | 'title'
  | 'series'
  | 'recent'
  | 'yearDesc'
  | 'yearAsc'
  | 'tmdbRating'
  | 'myRating'
  | 'runtimeAsc'
  | 'runtimeDesc';

export const SORTS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Titel A–Z' },
  { key: 'series', label: 'Reihe & Jahr' },
  { key: 'recent', label: 'Zuletzt ergänzt' },
  { key: 'yearDesc', label: 'Jahr (neu → alt)' },
  { key: 'yearAsc', label: 'Jahr (alt → neu)' },
  { key: 'tmdbRating', label: 'TMDB-Rating' },
  { key: 'myRating', label: 'Meine Bewertung' },
  { key: 'runtimeAsc', label: 'Laufzeit (kurz → lang)' },
  { key: 'runtimeDesc', label: 'Laufzeit (lang → kurz)' },
];

// numerischer Teil der ID (F057 -> 57, F108B -> 108) für "zuletzt ergänzt"
const idNum = (id: string) => parseInt(id.replace(/\D/g, ''), 10) || 0;

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

// nulls immer ans Ende
const nl = (v: number | null, dir: 1 | -1) => (v == null ? Infinity * dir * -1 : v);

export function sortMovies(list: Movie[], key: SortKey): Movie[] {
  const arr = [...list];
  switch (key) {
    case 'title':
      return arr.sort((a, b) => collator.compare(a.title, b.title));
    case 'series':
      // Filme einer Reihe zusammen und chronologisch; Einzelfilme nach Titel eingereiht
      return arr.sort(
        (a, b) =>
          collator.compare(a.franchise || a.title, b.franchise || b.title) ||
          nl(a.year, 1) - nl(b.year, 1) ||
          collator.compare(a.title, b.title),
      );
    case 'recent':
      // höchste ID zuerst = zuletzt in die Sammlung aufgenommen
      return arr.sort((a, b) => idNum(b.id) - idNum(a.id));
    case 'yearDesc':
      return arr.sort((a, b) => nl(b.year, -1) - nl(a.year, -1) || collator.compare(a.title, b.title));
    case 'yearAsc':
      return arr.sort((a, b) => nl(a.year, 1) - nl(b.year, 1) || collator.compare(a.title, b.title));
    case 'tmdbRating':
      return arr.sort(
        (a, b) => (b.tmdb?.rating ?? -1) - (a.tmdb?.rating ?? -1) || collator.compare(a.title, b.title),
      );
    case 'myRating':
      return arr.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || collator.compare(a.title, b.title));
    case 'runtimeAsc':
      return arr.sort((a, b) => nl(a.runtime, 1) - nl(b.runtime, 1) || collator.compare(a.title, b.title));
    case 'runtimeDesc':
      return arr.sort((a, b) => (b.runtime ?? -1) - (a.runtime ?? -1) || collator.compare(a.title, b.title));
    default:
      return arr;
  }
}
