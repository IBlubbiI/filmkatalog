// Dünner TMDB-Client für das Build-Skript.
//
// Unterstützt beide Key-Varianten:
//   - v4 "API Read Access Token" (langer JWT)  -> als Bearer-Header
//   - v3 "API Key" (kurz)                       -> als ?api_key=...
// Erkannt wird automatisch anhand der Länge/Form des Keys.
//
// Wird NUR aufgerufen, wenn ein Key vorhanden ist. Ohne Key läuft der Build
// komplett offline und lässt alle tmdb-Felder auf null.

import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

export function makeTmdbClient(key, { lang = 'de-DE' } = {}) {
  const isV4 = key.length > 50 || key.startsWith('eyJ'); // JWT beginnt mit eyJ
  const headers = { accept: 'application/json' };
  if (isV4) headers.Authorization = `Bearer ${key}`;

  let lastCall = 0;
  async function throttle() {
    // ~5 Anfragen/Sekunde, freundlich zu TMDB
    const wait = 200 - (Date.now() - lastCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
  }

  async function get(endpoint, params = {}) {
    await throttle();
    const url = new URL(BASE + endpoint);
    if (!isV4) url.searchParams.set('api_key', key);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, v);
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, { headers });
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after') || 1);
        await new Promise((r) => setTimeout(r, (retry + 1) * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`TMDB ${res.status} ${res.statusText} @ ${endpoint}`);
      return res.json();
    }
    throw new Error(`TMDB rate-limit nicht überwunden @ ${endpoint}`);
  }

  return {
    isV4,
    searchMovie: (query, year) =>
      get('/search/movie', { query, year, language: lang, include_adult: false }),
    searchTv: (query, year) =>
      get('/search/tv', { query, first_air_date_year: year, language: lang, include_adult: false }),
    movie: (id) => get(`/movie/${id}`, { language: lang }),
    tv: (id) => get(`/tv/${id}`, { language: lang }),
    // Deutschsprachiges Overview kann bei TMDB fehlen -> optionaler EN-Fallback
    movieEn: (id) => get(`/movie/${id}`, { language: 'en-US' }),
    tvEn: (id) => get(`/tv/${id}`, { language: 'en-US' }),
  };
}

// Lädt ein Poster/Backdrop nach public/posters/ herunter. Gibt den relativen
// Web-Pfad zurück (oder null bei Fehler / fehlendem Pfad).
export async function downloadImage(tmdbPath, destAbs, { size = 'w500' } = {}) {
  if (!tmdbPath) return null;
  const url = `${IMG}/${size}${tmdbPath}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.writeFileSync(destAbs, buf);
  return true;
}

export { IMG };
