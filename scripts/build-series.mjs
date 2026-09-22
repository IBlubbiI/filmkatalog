// =============================================================================
//  build-series.mjs  –  frischt NUR die Sammlung-/Release-Daten auf.
// =============================================================================
//  Liest die bereits gebaute public/movies.json (kein Zugriff auf die private
//  Excel) und schreibt collections.json + collection-extras.json neu – inkl.
//  aktuellem Disc-Release-Status und automatisch entdeckten Ablegern.
//
//  Gedacht für einen periodischen CI-Lauf (GitHub Action), damit neue Teile &
//  frische Disc-Releases erscheinen, ohne dass lokal neu gebaut werden muss.
//  Braucht nur TMDB_API_KEY in der Umgebung. Immer mit --refresh-Semantik.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { makeTmdbClient } from './lib/tmdb.mjs';
import { buildSeriesData } from './lib/series.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOVIES = path.join(ROOT, 'public', 'movies.json');

const KEY = process.env.TMDB_API_KEY || process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_TOKEN || null;
if (!KEY) {
  console.error('✗ Kein TMDB_API_KEY in der Umgebung – Abbruch.');
  process.exit(1);
}
if (!fs.existsSync(MOVIES)) {
  console.error(`✗ ${MOVIES} fehlt – erst movies.json bauen.`);
  process.exit(1);
}

const doc = JSON.parse(fs.readFileSync(MOVIES, 'utf8'));
const movies = doc.movies || [];
const client = makeTmdbClient(KEY);

console.log(`🎬 Sammlung-Refresh aus movies.json (${movies.length} Einträge) …`);
await buildSeriesData({
  movies,
  client,
  root: ROOT,
  refresh: true,
  log: (...a) => console.log(...a),
  warn: (...a) => console.warn('  ⚠ ', ...a),
});
console.log('✅ collections.json + collection-extras.json aktualisiert.');
