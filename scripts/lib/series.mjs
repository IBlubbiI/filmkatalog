// =============================================================================
//  series.mjs  –  baut collections.json + collection-extras.json für die
//                 "Sammlung"-Ansicht (Reihen mit Platzhaltern & Entdeckungen).
// =============================================================================
//  Braucht NUR die bereits angereicherten movies (tmdbId/collection/universe)
//  + einen TMDB-Client – also KEINE Excel. Dadurch kann derselbe Schritt lokal
//  (aus build-data heraus) UND in der CI (aus public/movies.json) laufen.
//
//  Je Titel wird ein Flag `future` bestimmt: Erstveröffentlichung (Kino/
//  Ausstrahlung) liegt noch in der Zukunft. Daraus leitet die App ab:
//    im Besitz · schon erschienen (erhältlich, entdeckbar) · noch nicht
//    erschienen ("Ohne Disc-Release", per Default ausgeblendet).
//  TMDBs Physical-Release-Daten sind für ältere Filme lückenhaft, deshalb wird
//  bewusst nur nach Erscheinungsdatum getrennt, nicht nach Disc-Eintrag.
//
//  Ableger/Fortsetzungen werden automatisch gesucht; Making-ofs, Featurettes,
//  Dokus und Kurzfilme werden dabei ausgefiltert (nur echte Filme & Serien).
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { SERIES_EXTRAS, SERIES_DENY, SERIES_NO_DISCOVERY } from './series-extras.mjs';

const TODAY = new Date().toISOString().slice(0, 10);
const isFuture = (dateStr) => !!dateStr && dateStr.slice(0, 10) > TODAY;

const seriesKeyOf = (m) => m.universe || m.franchise || (m.tmdb?.collection ? `col:${m.tmdb.collection.id}` : '');

// Titel in Wörter zerlegen; Apostrophe kleben am Wort (damit "Dexter's" ≠ "Dexter").
const words = (t) =>
  (t || '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9äöüß]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

// Zusatzmaterial/Platzhalter, die keine "richtigen" kaufbaren Filme/Serien sind.
const MAKING_OF =
  /making[ -]?of|behind the scenes|featurette|b-?roll|bonus|deleted scenes|outtakes|blooper|hörspiel|hörbuch|audiobook|the story of|anatomy of|red carpet|premiere|fan film|recap|untitled|unbenannt|\btba\b/i;
const isMakingOf = (t) => MAKING_OF.test(t || '');

function commonPrefix(lists) {
  if (!lists.length) return [];
  const out = [];
  for (let i = 0; ; i++) {
    const w = lists[0][i];
    if (w === undefined) break;
    if (lists.every((l) => l[i] === w)) out.push(w);
    else break;
  }
  return out;
}

function startsWithPrefix(cand, pref) {
  if (pref.length === 0 || cand.length < pref.length) return false;
  for (let i = 0; i < pref.length; i++) if (cand[i] !== pref[i]) return false;
  return true;
}

// Reihenname distinktiv genug? Ein einzelnes kurzes Wort ("300") ist zu generisch.
const distinctivePrefix = (pref) => pref.length >= 2 || (pref.length === 1 && pref[0].length >= 5);

// Nach dem Reihennamen folgt ein Untertitel-Trenner (":"/"–"/"-")? Also das Muster
// "Reihe: Untertitel" – nicht bloß ein gleich beginnender, unabhängiger Film.
function subtitleSeparated(title, pref) {
  const t = (title || '').toLowerCase().replace(/[’'`]/g, '').replace(/\s+/g, ' ').trim();
  const p = pref.join(' ');
  if (!t.startsWith(p)) return false;
  return /^\s*[:–—\-·|/]/.test(t.slice(p.length));
}

// Ist der Kandidat ein "echter" Film/Serie (kein Making-of/Kurzfilm/Doku)?
const movieIsReal = (d) =>
  !((d.genres || []).some((g) => g.id === 99) || (d.runtime > 0 && d.runtime < 40) || isMakingOf(d.title || d.original_title));
// Doku (99), Talk (10767), News (10763), Reality (10764) raus → keine echten Serien.
const tvIsReal = (d) => !((d.genres || []).some((g) => [99, 10767, 10763, 10764].includes(g.id)) || isMakingOf(d.name || d.original_name));

export async function buildSeriesData({ movies, client, root, refresh = false, log = () => {}, warn = () => {} }) {
  const readJson = (p, f) => {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return f;
    }
  };
  const COLLECTIONS_PATH = path.join(root, 'public', 'collections.json');
  const COLLECTIONS_CACHE = path.join(root, 'data', 'tmdb-collections-cache.json');
  const EXTRAS_PATH = path.join(root, 'public', 'collection-extras.json');

  const owned = movies.filter((m) => m.tmdb?.tmdbId);

  // TMDB-Infos für die Entdecken-Detailseite (nicht besessene Titel).
  const castOf = (d) =>
    (d.credits?.cast || []).slice(0, 8).map((c) => ({ name: c.name, character: c.character || null, profile: c.profile_path || null }));
  const rd2 = (v) => (typeof v === 'number' && v > 0 ? Math.round(v * 10) / 10 : null);

  // volle Angaben (future + Echtheits-/Anzeige-/Detailfelder) für Ableger/Entdeckungen.
  async function detailMeta(id, type) {
    try {
      if (type === 'tv') {
        const d = await client.tv(id);
        // noch nicht ausgestrahlt: Datum in der Zukunft oder gar kein Ausstrahlungsdatum
        const future = isFuture(d.first_air_date) || !d.first_air_date;
        return {
          future, real: tvIsReal(d), title: d.name || d.original_name, year: (d.first_air_date || '').slice(0, 4) || null, poster: d.poster_path || null,
          overview: d.overview || null, rating: rd2(d.vote_average), runtime: (d.episode_run_time || [])[0] || null, seasons: d.number_of_seasons || null, backdrop: d.backdrop_path || null, cast: castOf(d),
        };
      }
      const d = await client.movieFull(id);
      // noch nicht erschienen: künftiges Datum ODER TMDB-Status ≠ "Released" (angekündigt)
      const future = isFuture(d.release_date) || (!!d.status && d.status !== 'Released');
      return {
        future, real: movieIsReal(d), title: d.title || d.original_title, year: (d.release_date || '').slice(0, 4) || null, poster: d.poster_path || null,
        overview: d.overview || null, rating: rd2(d.vote_average), runtime: d.runtime || null, seasons: null, backdrop: d.backdrop_path || null, cast: castOf(d),
      };
    } catch (e) {
      warn(`Detail ${type || 'movie'} ${id}: ${e.message}`);
      return null;
    }
  }
  const detailFields = (m) => ({ overview: m.overview, rating: m.rating, runtime: m.runtime, seasons: m.seasons, backdrop: m.backdrop, cast: m.cast });

  // ---- 1. TMDB-Filmreihen (Collections) -------------------------------------
  const collCache = readJson(COLLECTIONS_CACHE, {});
  const collIds = [...new Set(owned.map((m) => m.tmdb.collection?.id).filter(Boolean))];
  let collFetched = 0;
  for (const cid of collIds) {
    if (!refresh && collCache[cid]) continue;
    try {
      const c = await client.collection(cid);
      collCache[cid] = {
        name: c.name,
        parts: (c.parts || [])
          .map((p) => ({ tmdbId: p.id, title: p.title, date: p.release_date || null, year: (p.release_date || '').slice(0, 4) || null, poster: p.poster_path || null }))
          .sort((a, b) => (a.year || 9999) - (b.year || 9999)),
      };
      collFetched++;
    } catch (e) {
      warn(`Sammlung ${cid}: ${e.message}`);
    }
  }
  fs.writeFileSync(COLLECTIONS_CACHE, JSON.stringify(collCache, null, 2));

  const ownedIds = new Set(owned.map((m) => m.tmdb.tmdbId));
  const deny = new Set(SERIES_DENY || []);
  const collectionsOut = {};
  for (const cid of collIds) {
    const c = collCache[cid];
    if (!c) continue;
    const parts = [];
    for (const p of c.parts) {
      if (deny.has(p.tmdbId)) continue;
      if (ownedIds.has(p.tmdbId)) {
        parts.push({ tmdbId: p.tmdbId, title: p.title, year: p.year, poster: p.poster, future: false });
        continue;
      }
      const meta = await detailMeta(p.tmdbId, 'movie'); // Status-basiertes future + Making-of/Untitled-Filter
      if (!meta || !meta.real) continue;
      parts.push({ tmdbId: p.tmdbId, type: 'movie', title: p.title, year: p.year, poster: p.poster, future: meta.future, ...detailFields(meta) });
    }
    collectionsOut[cid] = { name: c.name, parts };
  }
  fs.writeFileSync(COLLECTIONS_PATH, JSON.stringify(collectionsOut));
  log(`✓ ${Object.keys(collectionsOut).length} Filmreihen (${collFetched} neu geholt).`);

  // ---- Reihen-Gruppen (nach universe/franchise/collection) ------------------
  const groups = new Map(); // key -> { films:[], known:Set(tmdbId) }
  for (const m of owned) {
    const key = seriesKeyOf(m);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { films: [], known: new Set() });
    const g = groups.get(key);
    g.films.push(m);
    g.known.add(m.tmdb.tmdbId);
  }
  for (const g of groups.values()) {
    for (const m of g.films) {
      const cid = m.tmdb.collection?.id;
      if (cid && collectionsOut[cid]) for (const p of collectionsOut[cid].parts) g.known.add(p.tmdbId);
    }
  }

  const extrasOut = {};

  // ---- 2. Manuelle Zusatztitel (kuratiert – immer aufnehmen) ----------------
  for (const [key, items] of Object.entries(SERIES_EXTRAS)) {
    const parts = (extrasOut[key] = extrasOut[key] || []);
    for (const it of items) {
      if (deny.has(it.tmdbId)) continue;
      const meta = await detailMeta(it.tmdbId, it.type);
      if (!meta) continue;
      parts.push({ tmdbId: it.tmdbId, type: it.type, title: meta.title, year: meta.year, poster: meta.poster, future: meta.future, ...detailFields(meta) });
      groups.get(key)?.known.add(it.tmdbId);
    }
  }

  // ---- 3. Automatische Entdeckung gleichnamiger Reihen-Titel ----------------
  const MAX_PER_SERIES = 12;
  let discovered = 0;
  for (const [key, g] of groups) {
    if (SERIES_NO_DISCOVERY.has(key)) continue;
    const pref = commonPrefix(g.films.map((m) => words(m.title.replace(/\([^)]*\)/g, ' '))).filter((w) => w.length));
    if (!distinctivePrefix(pref)) continue;
    const query = pref.join(' ');
    let results = [];
    try {
      const [mv, tv] = await Promise.all([client.searchMovie(query), client.searchTv(query)]);
      results = [
        ...(mv.results || []).map((r) => ({ type: 'movie', id: r.id, title: r.title, orig: r.original_title, pop: r.popularity || 0 })),
        ...(tv.results || []).map((r) => ({ type: 'tv', id: r.id, title: r.name, orig: r.original_name, pop: r.popularity || 0 })),
      ];
    } catch (e) {
      warn(`Auto-Suche "${query}": ${e.message}`);
      continue;
    }
    const seen = new Set((extrasOut[key] || []).map((p) => p.tmdbId));
    const candidates = results
      .filter((r) => !g.known.has(r.id) && !deny.has(r.id) && !seen.has(r.id))
      .filter((r) => startsWithPrefix(words(r.title), pref) || startsWithPrefix(words(r.orig), pref))
      .filter((r) => subtitleSeparated(r.title, pref) || subtitleSeparated(r.orig, pref))
      .sort((a, b) => b.pop - a.pop);

    const parts = (extrasOut[key] = extrasOut[key] || []);
    let count = 0;
    for (const r of candidates) {
      if (count >= MAX_PER_SERIES) break;
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const meta = await detailMeta(r.id, r.type);
      if (!meta || !meta.real) continue; // Making-of/Kurzfilm/Doku raus
      parts.push({ tmdbId: r.id, type: r.type, title: meta.title || r.title, year: meta.year, poster: meta.poster, future: meta.future, auto: true, ...detailFields(meta) });
      g.known.add(r.id);
      count++;
      discovered++;
    }
  }

  for (const k of Object.keys(extrasOut)) if (!extrasOut[k].length) delete extrasOut[k];

  fs.writeFileSync(EXTRAS_PATH, JSON.stringify(extrasOut));
  log(`✓ Zusatz-Titel für ${Object.keys(extrasOut).length} Reihen (${discovered} automatisch entdeckt).`);
}
