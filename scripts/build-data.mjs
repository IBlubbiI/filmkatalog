// =============================================================================
//  build-data.mjs  –  erzeugt public/movies.json aus data/Filmsammlung.xlsx
// =============================================================================
//  Ablauf:
//    1. Excel lesen (Sheet "Filme – Übersicht")
//    2. Konsistenzprüfung (doppelte/fehlende IDs, fehlende Titel) -> ggf. Abbruch
//    3. Jede Zeile ins App-Datenmodell normalisieren
//    4. Optional: per TMDB anreichern (Poster, Backdrop, Rating, Kurzinhalt)
//       - nur wenn ein Key in .env liegt; sonst bleibt tmdb = null
//       - Cache (data/tmdb-cache.json) + Overrides (data/tmdb-overrides.json)
//    5. Verwaiste Poster aufräumen
//    6. movies.json (mit Versions-Hash) schreiben + Report ausgeben
//
//  Die Excel ist read-only und bleibt die einzige Wahrheit. movies.json wird
//  immer vollständig neu erzeugt, nie inkrementell.
//
//  Flags:  --refresh   erzwingt kompletten TMDB-Neuabruf (Cache ignorieren)
//          --no-tmdb   überspringt TMDB komplett (auch wenn Key vorhanden)
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import * as XLSX from 'xlsx';
import { universeOf } from './lib/universe-map.mjs';
import { canonicalLabel } from './lib/label-map.mjs';
import { buildSeriesData } from './lib/series.mjs';
import { makeTmdbClient, downloadImage } from './lib/tmdb.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const XLSX_PATH = path.join(ROOT, 'data', 'Filmsammlung.xlsx');
const SHEET = 'Filme – Übersicht';
const OUT_JSON = path.join(ROOT, 'public', 'movies.json');
const POSTER_DIR = path.join(ROOT, 'public', 'posters');
const CACHE_PATH = path.join(ROOT, 'data', 'tmdb-cache.json');
const OVERRIDES_PATH = path.join(ROOT, 'data', 'tmdb-overrides.json');
const REPORT_PATH = path.join(ROOT, 'data', 'build-report.md');
const UNMATCHED_PATH = path.join(ROOT, 'data', 'tmdb-unmatched.json');
const MATCHES_PATH = path.join(ROOT, 'data', 'tmdb-matches.md');

const FLAGS = new Set(process.argv.slice(2));
const REFRESH = FLAGS.has('--refresh');
const REFRESH_IMAGES = FLAGS.has('--refresh-images'); // erzwingt Neu-Download vorhandener Poster
const NO_TMDB = FLAGS.has('--no-tmdb');

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn('  ⚠ ', ...a);

// ---------------------------------------------------------------------------
//  kleine Helfer
// ---------------------------------------------------------------------------
const DASH = new Set(['–', '-', '—', '']);
const clean = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' || DASH.has(s) ? null : s;
};
const cleanKeepDash = (v) => (v == null ? null : String(v).trim() || null);

const yesNo = (v) => {
  const s = clean(v);
  if (!s) return null;
  const l = s.toLowerCase();
  if (l.startsWith('ja')) return 'Ja';
  if (l.startsWith('nein')) return 'Nein';
  if (l.startsWith('teil')) return 'Teilweise';
  return s;
};
const toBool = (v) => yesNo(v) === 'Ja';

const firstInt = (v) => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  const m = String(v).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};
const firstYear = (v) => {
  if (typeof v === 'number') return v >= 1870 && v <= 2100 ? v : null;
  if (v == null) return null;
  const m = String(v).match(/\b(1[89]\d{2}|20\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
};
// Trennt an Kommas/Semikolons, aber NICHT innerhalb von Klammern.
// (sonst zerfällt z. B. "diverse (BBC, HBO, Bad Wolf)" in Müll)
function splitTopLevel(str) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth = Math.max(0, depth - 1); cur += ch; }
    else if ((ch === ',' || ch === ';') && depth === 0) { parts.push(cur); cur = ''; }
    else cur += ch;
  }
  parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}
const splitList = (v) => {
  const s = clean(v);
  return s ? splitTopLevel(s) : [];
};

// Vom Nutzer beschlossene, verbindliche Genre-Schreibweisen (2026). Erzwingt
// Einheitlichkeit, auch wenn in der Excel noch die alten Namen stehen.
const GENRE_CANON = { Krimi: 'Crime', Abenteuer: 'Adventure', Liebesfilm: 'Romantik' };
const canonGenre = (g) => GENRE_CANON[g] || g;
const splitIds = (v) => {
  const s = clean(v);
  if (!s) return [];
  return s.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^F\d+[A-Z]?$/i.test(x));
};
// kanonische EAN: erster Ziffernblock mit >= 8 Stellen
const canonicalEan = (v) => {
  const s = v == null ? '' : String(v);
  const m = s.match(/\d{8,}/);
  return m ? m[0] : null;
};
const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ---------------------------------------------------------------------------
//  1. Excel lesen
// ---------------------------------------------------------------------------
if (!fs.existsSync(XLSX_PATH)) {
  console.error(`\n✖ Excel nicht gefunden: ${XLSX_PATH}`);
  console.error('  Lege data/Filmsammlung.xlsx an (siehe README) und starte erneut.\n');
  process.exit(1);
}
const wb = XLSX.read(fs.readFileSync(XLSX_PATH), { type: 'buffer' });
if (!wb.SheetNames.includes(SHEET)) {
  console.error(`\n✖ Sheet "${SHEET}" nicht gefunden. Vorhanden: ${wb.SheetNames.join(', ')}\n`);
  process.exit(1);
}
const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { defval: null, raw: true });
log(`\n📖 ${rows.length} Zeilen aus "${SHEET}" gelesen.`);

// ---------------------------------------------------------------------------
//  2. Konsistenzprüfung – bei Fehlern Abbruch, damit keine kaputte JSON entsteht
// ---------------------------------------------------------------------------
const problems = [];
const seenIds = new Map();
rows.forEach((r, i) => {
  const line = i + 2; // +1 Header, +1 1-basiert
  const id = clean(r.ID);
  const title = clean(r['Titel (DE)']);
  if (!id) problems.push(`Zeile ${line}: fehlende ID`);
  else if (seenIds.has(id)) problems.push(`Doppelte ID "${id}" (Zeilen ${seenIds.get(id)} und ${line})`);
  else seenIds.set(id, line);
  if (!title) problems.push(`Zeile ${line} (ID ${id ?? '?'}): fehlender Titel (DE)`);
});
if (problems.length) {
  console.error('\n✖ Konsistenzprüfung fehlgeschlagen – Build abgebrochen:');
  problems.forEach((p) => console.error('  •', p));
  console.error('\n  Bitte in der Excel korrigieren und erneut bauen.\n');
  process.exit(1);
}
log('✓ Konsistenzprüfung ok (IDs eindeutig, Titel vorhanden).');

// ---------------------------------------------------------------------------
//  3. Normalisieren
// ---------------------------------------------------------------------------
function toMovie(r) {
  const id = clean(r.ID);
  const title = clean(r['Titel (DE)']);
  const originalTitle = clean(r['Originaltitel']) || title;

  // Genres kommen bereinigt aus der Excel. Einzige Normalisierung: die vom Nutzer
  // beschlossenen Umbenennungen erzwingen, falls in neu ergänzten Zeilen noch die
  // alten Namen stehen (man darf also weiter "Krimi"/"Abenteuer" tippen).
  const genres = splitList(r['Genre']).map(canonGenre);
  const mainGenre = canonGenre(clean(r['Hauptgenre']) || genres[0] || '') || null;
  const category = clean(r['Kategorie']); // Marvel/DC etc. – jetzt direkt aus der Excel

  const year = firstYear(r['Jahr']);
  const yearRaw = clean(r['Jahr']); // reines "–" -> null, Bereiche wie "2010–2013" bleiben
  const decade = year ? `${Math.floor(year / 10) * 10}er` : null;

  const discFormat = clean(r['Discformat(e)']);
  const is4kDisc = !!discFormat && discFormat.includes('4K UHD');
  const hasBluray = !!discFormat && discFormat.includes('Blu-ray');
  const hasDvd = discFormat === 'DVD';

  const hdrRaw = clean(r['HDR']);
  const hdr = hdrRaw && hdrRaw.toLowerCase() !== 'nein' ? hdrRaw : null;
  const hasHdr = !!hdr;
  const hasDolbyVision = !!hdr && /dolby vision/i.test(hdr);

  const eanRaw = cleanKeepDash(r['EAN']);
  const ean = canonicalEan(r['EAN']);
  const box = clean(r['Box/Sammlung']);
  const boxKey = ean || (box ? `box:${slug(box)}` : null);

  const typ = clean(r['Typ']);
  const type = typ === 'Serie' ? 'Serie' : 'Film'; // leer/Sammlung -> Film (bestätigt)

  return {
    id,
    title,
    originalTitle,
    directors: splitList(r['Regie']),
    franchise: clean(r['Reihe/Franchise']),
    universe: universeOf(clean(r['Reihe/Franchise']), id),
    category,
    genres,
    // Gesamt-Genre-Set (Hauptgenre + alle Genres) für die UND-Filterung
    genresAll: [...new Set([mainGenre, ...genres].filter(Boolean))],
    mainGenre,
    year,
    yearRaw,
    decade,
    // Disc / Format
    discFormat,
    is4kDisc,
    hasBluray,
    hasDvd,
    discCount: firstInt(r['Discs']),
    discCountRaw: cleanKeepDash(r['Discs']),
    edition: clean(r['Edition/Verpackung']),
    // Sammlung
    box,
    boxKey,
    label: clean(r['Label']),
    labelMain: canonicalLabel(clean(r['Label'])),
    ean,
    eanRaw,
    // Technik
    fsk: firstInt(r['FSK']), // null = unbekannt
    runtime: firstInt(r['Laufzeit (Min., ca.)']),
    hdr,
    hdrRaw,
    hasHdr,
    hasDolbyVision,
    native4k: yesNo(r['Natives 4K']),
    aspectRatio: (() => {
      const a = clean(r['Bildformat']);
      return a && /^\d+(\.\d+)?\s*:\s*\d+$/.test(a) ? a : null; // Freitext ("nicht ermittelt…") -> null
    })(),
    audioOriginal: clean(r['Beste OV-Tonspur']),
    audioGerman: clean(r['Beste DE-Tonspur']),
    atmos: yesNo(r['Atmos?']),
    extendedCut: toBool(r['Extended Cut?']),
    ecRuntime: clean(r['EC Mehrlaufzeit']),
    ecDisc: clean(r['EC auf Disc']),
    ecAudio: clean(r['EC Tonspur']),
    subtitlesDe: clean(r['DE-Untertitel']),
    bonus: clean(r['Bonusmaterial']),
    digitalCopy: toBool(r['Digitale Kopie']),
    // vom Nutzer gepflegt (aktuell meist leer)
    location: clean(r['Standort']),
    seen: (() => {
      const s = yesNo(r['Gesehen']);
      return s === 'Ja' ? true : s === 'Nein' ? false : null; // Freitext-Notiz -> null
    })(),
    rating: (() => {
      const n = typeof r['Bewertung (1–10)'] === 'number' ? r['Bewertung (1–10)'] : null;
      return n != null && n >= 1 && n <= 10 ? n : null; // Freitext-Notiz -> null
    })(),
    lentTo: clean(r['Verliehen an']),
    type,
    duplicateIds: splitIds(r['Weitere Exemplare (IDs)']),
    tmdb: null, // wird ggf. unten befüllt
  };
}

const movies = rows.map(toMovie);
log(`✓ ${movies.length} Einträge normalisiert.`);

// ---------------------------------------------------------------------------
//  4. TMDB-Anreicherung (optional)
// ---------------------------------------------------------------------------
const TMDB_KEY =
  process.env.TMDB_API_KEY ||
  process.env.TMDB_READ_ACCESS_TOKEN ||
  process.env.TMDB_TOKEN ||
  null;

const readJson = (p, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
};

const cache = readJson(CACHE_PATH, {});
const overrides = readJson(OVERRIDES_PATH, {});
const unmatched = [];
const matches = []; // QA: was wurde worauf gematcht (für tmdb-matches.md)

// String-Ähnlichkeit (0..1) via Levenshtein
const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const d = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[n];
}
const sim = (a, b) => {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - lev(a, b) / Math.max(a.length, b.length);
};

// Titel-Varianten für Suche & Scoring: Original + DE, jeweils auch "gesäubert"
// (Klammer-Zusätze wie "(Director's Cut)" und Suffixe nach " – " wie
// "Die komplette Serie", "Staffel 3", "5-DVD-Box" entfernt).
function stripTitle(t) {
  if (!t) return null;
  let s = String(t)
    .replace(/\([^)]*\)/g, ' ') // (Director's Cut), (5-DVD-Box), (Uncut)
    .replace(/\s[–—]\s.*$/, ' ') // alles nach " – " (nur Gedankenstrich, NICHT Bindestrich:
    //                              "Augsburger Puppenkiste - Jim Knopf ..." bleibt erhalten)
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s || null;
}
function titleVariants(movie) {
  return [
    ...new Set(
      [movie.originalTitle, movie.title, stripTitle(movie.originalTitle), stripTitle(movie.title)].filter(Boolean),
    ),
  ];
}

// bewertet einen TMDB-Kandidaten gegen die Titel-Varianten einer Excel-Zeile
function scoreCandidate(variants, movie, cand, isTv) {
  const candTitle = isTv ? cand.name : cand.title;
  const candOrig = isTv ? cand.original_name : cand.original_title;
  const candDate = isTv ? cand.first_air_date : cand.release_date;
  const candYear = candDate ? parseInt(String(candDate).slice(0, 4), 10) : null;

  let titleSim = 0;
  for (const v of variants) titleSim = Math.max(titleSim, sim(v, candTitle), sim(v, candOrig));

  let yearScore = 0;
  if (movie.year && candYear) {
    const diff = Math.abs(movie.year - candYear);
    yearScore = diff === 0 ? 1 : diff === 1 ? 0.7 : diff <= 2 ? 0.3 : diff <= 4 ? -0.4 : -0.9;
  }
  const popBonus = Math.min((cand.vote_count || 0) / 5000, 0.1);
  return titleSim * 0.75 + yearScore * 0.2 + popBonus;
}

async function findMatch(client, movie) {
  const isTv = movie.type === 'Serie';
  const search = isTv ? client.searchTv.bind(client) : client.searchMovie.bind(client);
  const variants = titleVariants(movie);
  // jede Variante mit Jahr und ohne Jahr durchsuchen
  const queries = [];
  for (const v of variants) queries.push([v, movie.year]);
  for (const v of variants) queries.push([v, null]);

  let best = null;
  const tried = new Set();
  for (const [q, y] of queries) {
    const key = `${q}|${y}`;
    if (!q || tried.has(key)) continue;
    tried.add(key);
    let res;
    try {
      res = await search(q, y);
    } catch (e) {
      warn(`${movie.id} Suche fehlgeschlagen: ${e.message}`);
      continue;
    }
    for (const cand of (res.results || []).slice(0, 8)) {
      const score = scoreCandidate(variants, movie, cand, isTv);
      if (!best || score > best.score) best = { cand, score };
    }
    if (best && best.score >= 0.9) break; // sehr sicher -> aufhören
  }
  // konservative Schwelle: lieber null als falsch verknüpfen
  const THRESHOLD = movie.year ? 0.55 : 0.8;
  if (best && best.score >= THRESHOLD) return { id: best.cand.id, score: best.score, isTv };
  return null;
}

async function maybeDownload(tmdbPath, fileName, size, force = false) {
  if (!tmdbPath) return null;
  const dest = path.join(POSTER_DIR, fileName);
  const rel = `posters/${fileName}`;
  if (!force && !REFRESH_IMAGES && fs.existsSync(dest)) return rel; // bereits vorhanden -> überspringen
  await downloadImage(tmdbPath, dest, { size });
  return rel;
}

async function enrichFromTmdb(client, movie, tmdbId, isTv, score, source, posterOverride = null) {
  const getDetails = isTv ? client.tv.bind(client) : client.movie.bind(client);
  const getEn = isTv ? client.tvEn.bind(client) : client.movieEn.bind(client);
  const det = await getDetails(tmdbId);
  let overview = det.overview;
  if (!overview) {
    try {
      overview = (await getEn(tmdbId)).overview || null;
    } catch {}
  }
  const matchedTitle = (isTv ? det.name : det.title) || (isTv ? det.original_name : det.original_title) || null;
  const matchedDate = isTv ? det.first_air_date : det.release_date;
  const matchedYear = matchedDate ? parseInt(String(matchedDate).slice(0, 4), 10) : null;
  // posterOverride: bestimmtes Poster aus der TMDB-Galerie erzwingen (z. B. alternative
  // Fassung mit anderem Titelbild) -> immer neu laden, damit es ein altes ersetzt.
  const poster = await maybeDownload(posterOverride || det.poster_path, `${movie.id}.jpg`, 'w500', !!posterOverride);
  const backdrop = await maybeDownload(det.backdrop_path, `${movie.id}_bg.jpg`, 'w780');
  // Wichtigste Darsteller (Top 8)
  const cast = (det.credits?.cast || [])
    .slice(0, 8)
    .map((c) => ({ name: c.name, character: c.character || null, profile: c.profile_path || null }));
  // TMDB-Sammlung (nur Filme) – für die "Sammlung"-Ansicht mit Platzhaltern
  const collection = det.belongs_to_collection
    ? { id: det.belongs_to_collection.id, name: det.belongs_to_collection.name }
    : null;
  return {
    tmdbId,
    type: isTv ? 'tv' : 'movie',
    rating: det.vote_average ?? null,
    votes: det.vote_count ?? null,
    overview: overview || null,
    poster,
    backdrop,
    cast,
    collection,
    matchedTitle,
    matchedYear,
    score: score ?? null,
    source: source || 'auto',
    fetchedAt: new Date().toISOString(),
    matched: true,
  };
}

if (NO_TMDB || !TMDB_KEY) {
  log(
    NO_TMDB
      ? '\n⏭  TMDB übersprungen (--no-tmdb). Alle tmdb-Felder bleiben null.'
      : '\nℹ  Kein TMDB-Key in .env gefunden – Build läuft ohne Anreicherung.\n   (tmdb bleibt null; sobald du TMDB_API_KEY einträgst, holt der nächste Build Poster & Ratings.)',
  );
  movies.forEach((m) => unmatched.push({ id: m.id, title: m.title, year: m.year }));
} else {
  const client = makeTmdbClient(TMDB_KEY);
  log(`\n🎬 TMDB-Anreicherung aktiv (${client.isV4 ? 'v4-Token' : 'v3-Key'})${REFRESH ? ', --refresh' : ''} …`);
  let done = 0, fromCache = 0, fetched = 0, failed = 0;
  for (const m of movies) {
    done++;
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, m.id);
    const override = overrides[m.id];
    // Expliziter null-Override = "bewusst nicht zuordnen" (Platzhalter statt falschem Poster)
    if (hasOverride && override === null) {
      cache[m.id] = { matched: false, fetchedAt: new Date().toISOString() };
      unmatched.push({ id: m.id, title: m.title, year: m.year, originalTitle: m.originalTitle, note: 'override:null' });
      failed++;
      continue;
    }
    const cached = cache[m.id];
    // Cache nutzen, außer --refresh oder bisher erfolglos
    if (!REFRESH && !override && cached && cached.matched) {
      m.tmdb = {
        tmdbId: cached.tmdbId, rating: cached.rating, votes: cached.votes,
        overview: cached.overview, poster: cached.poster, backdrop: cached.backdrop,
        cast: cached.cast ?? [], collection: cached.collection ?? null,
      };
      matches.push({ id: m.id, excelTitle: m.title, excelYear: m.year, matchedTitle: cached.matchedTitle ?? null, matchedYear: cached.matchedYear ?? null, tmdbId: cached.tmdbId, score: cached.score ?? null, source: 'cache' });
      fromCache++;
      continue;
    }
    try {
      let tmdbId = null, isTv = m.type === 'Serie', score = null, source = 'auto', posterOverride = null;
      if (override != null) {
        source = 'override';
        if (typeof override === 'object') { tmdbId = override.id; isTv = override.type === 'tv'; posterOverride = override.poster || null; }
        else tmdbId = override;
      } else {
        const match = await findMatch(client, m);
        if (match) { tmdbId = match.id; isTv = match.isTv; score = match.score; }
      }
      if (tmdbId != null) {
        const data = await enrichFromTmdb(client, m, tmdbId, isTv, score, source, posterOverride);
        cache[m.id] = data;
        m.tmdb = { tmdbId: data.tmdbId, rating: data.rating, votes: data.votes, overview: data.overview, poster: data.poster, backdrop: data.backdrop, cast: data.cast, collection: data.collection };
        matches.push({ id: m.id, excelTitle: m.title, excelYear: m.year, matchedTitle: data.matchedTitle, matchedYear: data.matchedYear, tmdbId, score: data.score, source });
        fetched++;
      } else {
        cache[m.id] = { matched: false, fetchedAt: new Date().toISOString() };
        unmatched.push({ id: m.id, title: m.title, year: m.year, originalTitle: m.originalTitle });
        failed++;
      }
    } catch (e) {
      warn(`${m.id} "${m.title}": ${e.message}`);
      unmatched.push({ id: m.id, title: m.title, year: m.year, error: e.message });
      failed++;
    }
    if (done % 25 === 0) log(`   … ${done}/${movies.length}`);
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  log(`✓ TMDB fertig: ${fetched} neu geholt, ${fromCache} aus Cache, ${failed} ohne Treffer.`);

  // Sammlung-Ansicht: Filmreihen + Ableger + Disc-Release-Status (eigenes Modul,
  // damit derselbe Schritt auch in der CI aus public/movies.json laufen kann)
  await buildSeriesData({ movies, client, root: ROOT, refresh: REFRESH, log, warn });
}

// ---------------------------------------------------------------------------
//  5. Verwaiste Poster aufräumen
// ---------------------------------------------------------------------------
const validIds = new Set(movies.map((m) => m.id));
let removedPosters = 0;
if (fs.existsSync(POSTER_DIR)) {
  for (const f of fs.readdirSync(POSTER_DIR)) {
    const idOfFile = f.replace(/(_bg)?\.(jpg|jpeg|png|webp)$/i, '');
    if (!validIds.has(idOfFile)) {
      fs.unlinkSync(path.join(POSTER_DIR, f));
      log(`   🗑  verwaistes Poster entfernt: ${f}`);
      removedPosters++;
    }
  }
}

// ---------------------------------------------------------------------------
//  6. movies.json schreiben (mit Versions-Hash) + Report
// ---------------------------------------------------------------------------
const prev = readJson(OUT_JSON, null);
const prevIds = new Set((prev?.movies || []).map((m) => m.id));
const added = movies.filter((m) => !prevIds.has(m.id));
const removed = [...prevIds].filter((id) => !validIds.has(id));

const payloadForHash = JSON.stringify(movies);
const version = crypto.createHash('sha256').update(payloadForHash).digest('hex').slice(0, 12);
const generatedAt = new Date().toISOString();

const out = { version, generatedAt, count: movies.length, movies };
fs.writeFileSync(OUT_JSON, JSON.stringify(out));
fs.writeFileSync(UNMATCHED_PATH, JSON.stringify(unmatched, null, 2));

// Report
const withTmdb = movies.filter((m) => m.tmdb).length;
const fmt = (arr) => (arr.length ? arr.map((m) => `- ${m.id} – ${m.title}${m.year ? ` (${m.year})` : ''}`).join('\n') : '_(keine)_');
const report = `# Build-Report – ${generatedAt}

- **Einträge gesamt:** ${movies.length}
- **Version (Hash):** \`${version}\`
- **Mit TMDB-Treffer:** ${withTmdb}
- **Ohne TMDB-Treffer:** ${unmatched.length}
- **Neue Einträge ggü. letztem Build:** ${added.length}
- **Entfernte Einträge:** ${removed.length}
- **Verwaiste Poster gelöscht:** ${removedPosters}

## Neue Einträge
${fmt(added)}

## Entfernte Einträge
${removed.length ? removed.map((id) => `- ${id}`).join('\n') : '_(keine)_'}

## Ohne TMDB-Treffer (manuell in data/tmdb-overrides.json nachpflegen)
${unmatched.length ? unmatched.map((m) => `- ${m.id} – ${m.title}${m.year ? ` (${m.year})` : ''}${m.originalTitle && m.originalTitle !== m.title ? ` [${m.originalTitle}]` : ''}`).join('\n') : '_(alle zugeordnet)_'}
`;
fs.writeFileSync(REPORT_PATH, report);

// QA-Report: was wurde worauf gematcht – nach Konfidenz aufsteigend (unsichere zuerst)
if (matches.length) {
  const sorted = [...matches].sort((a, b) => (a.score ?? 1) - (b.score ?? 1));
  const yr = (y) => (y ? ` (${y})` : '');
  const flag = (m) => {
    const s = m.score;
    if (s == null) return '   '; // override/cache ohne Score
    if (s < 0.7) return '🔴 ';
    if (s < 0.85) return '🟡 ';
    return '🟢 ';
  };
  const lines = sorted.map(
    (m) =>
      `${flag(m)}${m.score != null ? m.score.toFixed(2) : ' – '}  ${m.id}  "${m.excelTitle}"${yr(m.excelYear)}  →  "${m.matchedTitle ?? '?'}"${yr(m.matchedYear)}  #${m.tmdbId}${m.source !== 'auto' ? ` [${m.source}]` : ''}`,
  );
  const lowConf = sorted.filter((m) => m.score != null && m.score < 0.85).length;
  const matchesReport = `# TMDB-Zuordnungen – ${generatedAt}

Sortiert nach Konfidenz (unsichere zuerst). 🔴 = bitte prüfen, 🟡 = grenzwertig, 🟢 = sicher.
Falsche Treffer per data/tmdb-overrides.json korrigieren, z. B. \`"${sorted[0]?.id ?? 'F123'}": 12345\`.

**${matches.length} zugeordnet · davon ${lowConf} mit Konfidenz < 0.85 (🔴/🟡) zum Prüfen.**

\`\`\`
${lines.join('\n')}
\`\`\`
`;
  fs.writeFileSync(MATCHES_PATH, matchesReport);
}

// Konsolen-Zusammenfassung
log('\n' + '─'.repeat(56));
log(`✅ movies.json geschrieben  (${movies.length} Einträge, v${version})`);
log(`   → ${path.relative(ROOT, OUT_JSON)}`);
log(`📊 mit TMDB: ${withTmdb} · ohne TMDB: ${unmatched.length} · neu: ${added.length} · entfernt: ${removed.length}`);
log(`📝 Report:   ${path.relative(ROOT, REPORT_PATH)}`);
if (unmatched.length && TMDB_KEY && !NO_TMDB) log(`📝 Unmatched: ${path.relative(ROOT, UNMATCHED_PATH)}`);
log('─'.repeat(56) + '\n');
