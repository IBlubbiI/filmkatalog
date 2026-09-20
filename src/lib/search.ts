import Fuse from 'fuse.js';
import type { Movie } from '../types';

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function makeFuse(movies: Movie[]): Fuse<Movie> {
  return new Fuse(movies, {
    keys: [
      { name: 'title', weight: 0.5 },
      { name: 'originalTitle', weight: 0.3 },
      { name: 'directors', weight: 0.2 },
    ],
    threshold: 0.3, // nur als Tippfehler-Fallback -> eher streng
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}

/**
 * Vorhersehbare Suche: jedes getippte Wort muss in Titel/Originaltitel/Regie
 * vorkommen (Teilwort, diakritik-unabhängig). Mehr tippen = weniger Treffer.
 * Findet die Substring-Suche gar nichts (klassischer Tippfehler), greift Fuse
 * als Fuzzy-Fallback. Gibt null zurück, wenn keine (sinnvolle) Suche aktiv ist.
 */
export function searchMovies(movies: Movie[], fuse: Fuse<Movie>, query: string): Movie[] | null {
  const q = norm(query).trim();
  if (q.length < 2) return null;
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored: { m: Movie; score: number }[] = [];
  for (const m of movies) {
    const title = norm(m.title);
    const orig = norm(m.originalTitle);
    const dirs = norm(m.directors.join(' '));
    const hay = `${title} ${orig} ${dirs}`;
    if (!tokens.every((t) => hay.includes(t))) continue;

    let score = 0;
    if (title.startsWith(q)) score += 1000;
    else if (title.includes(q)) score += 500;
    else if (title.includes(tokens[0])) score += 200;
    if (orig.includes(q)) score += 120;
    if (dirs.includes(q)) score += 60;
    score += tokens.filter((t) => title.includes(t)).length * 10;
    scored.push({ m, score });
  }

  if (scored.length === 0) return fuse.search(query.trim()).map((r) => r.item);

  scored.sort((a, b) => b.score - a.score || a.m.title.localeCompare(b.m.title, 'de'));
  return scored.map((s) => s.m);
}
