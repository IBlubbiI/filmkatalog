// =============================================================================
//  people.mjs  –  baut public/people.json (Darsteller-Infos für das Cast-Popup).
// =============================================================================
//  Sammelt alle Personen-IDs aus den Besetzungen (eigene Filme + Entdeckungen),
//  holt je Person die Stammdaten von TMDB (Geburtsdatum, Geburtsort, Kurzbio …)
//  und schreibt sie kompakt als { [id]: {...} } nach public/people.json.
//
//  Cache: data/tmdb-people-cache.json – Personendaten ändern sich kaum, daher
//  werden sie dauerhaft gecacht (nur mit refresh=true neu geholt).
//  Braucht denselben TMDB-Client wie der restliche Build.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';

const readJson = (p, f) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return f;
  }
};

// Biografie auf ~700 Zeichen kürzen (an Satzgrenze, sonst an Wortgrenze).
function trimBio(text) {
  if (!text) return '';
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= 700) return t;
  const cut = t.slice(0, 700);
  const lastDot = cut.lastIndexOf('. ');
  if (lastDot > 400) return cut.slice(0, lastDot + 1);
  const lastSpace = cut.lastIndexOf(' ');
  return cut.slice(0, lastSpace > 0 ? lastSpace : 700).trim() + ' …';
}

export async function buildPeopleData({ movies, root, client, refresh = false, log = () => {}, warn = () => {} }) {
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const CACHE_PATH = path.join(root, 'data', 'tmdb-people-cache.json');
  const OUT_PATH = path.join(root, 'public', 'people.json');
  const COLLECTIONS = readJson(path.join(root, 'public', 'collections.json'), {});
  const EXTRAS = readJson(path.join(root, 'public', 'collection-extras.json'), {});

  // 1. Alle Personen-IDs aus Besetzungen einsammeln (eigene Filme + Entdeckungen).
  const ids = new Set();
  for (const m of movies) for (const c of m.tmdb?.cast || []) if (c.id) ids.add(c.id);
  for (const coll of Object.values(COLLECTIONS)) for (const p of coll.parts || []) for (const c of p.cast || []) if (c.id) ids.add(c.id);
  for (const arr of Object.values(EXTRAS)) for (const p of arr) for (const c of p.cast || []) if (c.id) ids.add(c.id);

  const cache = readJson(CACHE_PATH, {});
  let fetched = 0;
  for (const id of ids) {
    if (!refresh && cache[id]) continue;
    try {
      let d = await client.person(id);
      let bio = d.biography || '';
      if (!bio) {
        // Deutsche Vita fehlt oft → englischer Fallback nur für die Biografie.
        const en = await client.person(id, 'en-US').catch(() => null);
        if (en?.biography) bio = en.biography;
      }
      cache[id] = {
        name: d.name || null,
        birthday: d.birthday || null,
        deathday: d.deathday || null,
        place: d.place_of_birth || null,
        department: d.known_for_department || null,
        profile: d.profile_path || null,
        bio: trimBio(bio),
      };
      fetched++;
      if (fetched % 50 === 0) log(`   … ${fetched} Personen geholt`);
    } catch (e) {
      warn(`Person ${id}: ${e.message}`);
    }
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));

  // 2. Nur die aktuell benötigten Personen ausliefern (schlank halten).
  const out = {};
  for (const id of ids) if (cache[id]) out[id] = cache[id];
  fs.writeFileSync(OUT_PATH, JSON.stringify(out));
  log(`✓ Darsteller-Infos für ${Object.keys(out).length} Personen (${fetched} neu geholt).`);
}
