// Manuelle TMDB-Zuordnungen für Filme, die die Auto-Suche falsch (oder gar nicht)
// trifft. Wird beim Build mit data/tmdb-overrides.json gemischt (die lokale Datei
// hat Vorrang). Format je ID:  <tmdbId>  ODER  { id, type?: 'movie'|'tv', poster? }
//
// Nach Änderungen `npm run build:data` neu laufen lassen.

export const TMDB_OVERRIDES = {
  // Dinosaurier – Im Reich der Giganten: BBC-Doku (1999), nicht der Animationsfilm.
  F319: { id: 3557, type: 'tv' },
};
