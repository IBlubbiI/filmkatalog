// =============================================================================
//  research-disc-capacity.mjs  –  einmaliger Rechercheauf für Disc-Kapazitäten
// =============================================================================
//  Füllt die Disc-Kapazität für bereits eingepflegte 4K-/Blu-ray-Titel aus
//  media-dealer.de – NUR wenn die EAN exakt übereinstimmt (also wirklich die
//  Edition, die du besitzt). Läuft komplett außerhalb der App.
//
//  Ablauf je Film: Titel bei media-dealer suchen → Kandidaten-Produktseiten
//  laden → die Seite mit passender EAN nehmen → "Medientyp" auslesen.
//
//  Ausgabe (data/):
//    - disc-capacity.json         Cache/Ergebnisse je Film (wiederaufnehmbar)
//    - disc-capacity-updates.sql  UPDATE-Statements für Supabase (nur Treffer)
//    - disc-capacity-review.md    Nicht-Treffer mit Kandidaten zum manuellen Prüfen
//
//  Aufruf:
//    node scripts/research-disc-capacity.mjs            # 4K zuerst, dann Blu-ray
//    node scripts/research-disc-capacity.mjs --4k       # nur 4K-Titel
//    node scripts/research-disc-capacity.mjs --limit 10 # nur die ersten 10 (Test)
//    node scripts/research-disc-capacity.mjs --refresh  # Cache ignorieren
//
//  Höflich gedrosselt (~400 ms/Request). Abbruch mit Strg+C ist unkritisch –
//  der nächste Lauf macht dank Cache dort weiter, wo aufgehört wurde.
// =============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOVIES = path.join(ROOT, 'public', 'movies.json');
const OUT_JSON = path.join(ROOT, 'data', 'disc-capacity.json');
const OUT_SQL = path.join(ROOT, 'data', 'disc-capacity-updates.sql');
const OUT_REVIEW = path.join(ROOT, 'data', 'disc-capacity-review.md');

const FLAGS = new Set(process.argv.slice(2));
const ONLY_4K = FLAGS.has('--4k');
const REFRESH = FLAGS.has('--refresh');
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? parseInt(process.argv[i + 1], 10) || Infinity : Infinity;
})();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const BASE = 'https://www.media-dealer.de';
const THROTTLE = 2200; // ms zwischen Requests – zu schnell → media-dealer liefert generische Listen
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digits = (s) => String(s || '').replace(/\D/g, '');
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Signifikante Titel-Wörter (≥4 Zeichen) für den Kandidaten-Abgleich im URL-Slug.
const titleTokens = (t) => [...new Set(norm(t).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter((w) => w.length >= 4))];

let COOKIE = 'language=0';
const HEADERS = () => ({
  'user-agent': UA,
  cookie: COOKIE,
  referer: BASE + '/',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
  'upgrade-insecure-requests': '1',
});
async function get(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS() });
      if (res.ok) return await res.text();
    } catch {
      /* retry */
    }
    await sleep(1500);
  }
  return '';
}

// Suchergebnis → eindeutige Produkt-URLs (ohne Query), gefiltert auf solche, deren
// Slug ein Titel-Wort enthält (blendet die generische Fallback-Liste aus).
async function searchProducts(query, tokens, retried = false) {
  const html = await get(`${BASE}/index.php?lang=0&cl=search&searchparam=${encodeURIComponent(query)}`);
  const urls = [...new Set([...html.matchAll(/href="(https:\/\/www\.media-dealer\.de\/[^"]+?\.html)(?:[?#][^"]*)?"/g)].map((m) => m[1]))];
  if (!tokens.length) return urls; // sehr kurzer Titel → nicht filtern
  const relevant = urls.filter((u) => {
    const slug = norm(u.split('/').pop());
    return tokens.some((t) => slug.includes(t));
  });
  // Nichts Passendes, aber Produkte da → vermutlich generische Fallback-Liste. Einmal
  // kurz abkühlen und erneut versuchen.
  if (!relevant.length && urls.length && !retried) {
    await sleep(5000);
    return searchProducts(query, tokens, true);
  }
  return relevant;
}

// Produktseite → alle Attribut-Paare (Medientyp, EAN, Bildformat …) + Titel.
function parseProduct(html) {
  const attrs = {};
  for (const m of html.matchAll(/<strong>([^<]+)<\/strong><\/span><br\/>\s*<span class="value"[^>]*>([^<]*)<\/span>/g)) {
    attrs[m[1].trim()] = m[2].trim();
  }
  const title = (html.match(/<title>([^<]+)</i) || [])[1]?.trim() || null;
  return { attrs, title };
}

// media-dealer-Schreibweise auf die kurze Konvention normieren.
function normalizeCapacity(s) {
  return String(s || '')
    .replace(/Ultra ?HD Blu-?ray/gi, 'UHD BD')
    .replace(/Blu-?ray Disc/gi, 'BD')
    .replace(/Blu-?ray/gi, 'BD')
    .replace(/\s+/g, ' ')
    .trim();
}

// Vereinfachte Zweit-Query (Untertitel/Klammern weg), falls die erste nichts bringt.
const simplify = (t) => t.replace(/\([^)]*\)/g, ' ').split(/[:–-]/)[0].replace(/\s+/g, ' ').trim();

function loadJson(p, f) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return f;
  }
}

const sqlEscape = (s) => String(s).replace(/'/g, "''");

async function main() {
  // Frische Session (Cookie) holen – ohne liefert die Suche teils generische Listen.
  try {
    const r0 = await fetch(BASE + '/', { headers: { 'user-agent': UA } });
    const set = (r0.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).filter(Boolean);
    if (set.length) COOKIE = set.join('; ');
  } catch {
    /* Default-Cookie behalten */
  }

  const doc = JSON.parse(fs.readFileSync(MOVIES, 'utf8'));
  const all = doc.movies || [];
  // 4K zuerst (Priorität), dann restliche Blu-ray; nur mit EAN.
  const fourK = all.filter((m) => m.is4kDisc && m.ean);
  const bd = all.filter((m) => !m.is4kDisc && m.hasBluray && m.ean);
  let targets = ONLY_4K ? fourK : [...fourK, ...bd];
  targets = targets.slice(0, LIMIT);

  // EANs, die sich mehrere Filme teilen (Boxen) → markieren.
  const eanCount = {};
  for (const m of all) if (m.ean) eanCount[digits(m.ean)] = (eanCount[digits(m.ean)] || 0) + 1;

  const results = REFRESH ? {} : loadJson(OUT_JSON, {});
  console.log(`🔎 ${targets.length} Titel (${fourK.length} × 4K, ${ONLY_4K ? 0 : bd.length} × BD). EAN-genauer Abgleich bei media-dealer …\n`);

  let done = 0,
    matched = 0;
  for (const m of targets) {
    done++;
    if (results[m.id]?.status === 'matched' && !REFRESH) {
      matched++;
      continue; // schon erledigt
    }
    const ean = digits(m.ean);
    const boxShared = (eanCount[ean] || 0) > 1;
    let rec = { id: m.id, title: m.title, ean, is4k: !!m.is4kDisc, boxShared, status: 'nomatch', discCapacity: null, productUrl: null, candidates: [] };

    try {
      const tokens = titleTokens(m.title);
      await sleep(THROTTLE);
      let urls = await searchProducts(m.title, tokens);
      if (!urls.length && simplify(m.title) !== m.title) {
        await sleep(THROTTLE);
        urls = await searchProducts(simplify(m.title), tokens);
      }
      for (const url of urls.slice(0, 6)) {
        await sleep(THROTTLE);
        const { attrs, title } = parseProduct(await get(url));
        const foundEan = digits(attrs['EAN']);
        rec.candidates.push({ title, ean: foundEan, url, medientyp: attrs['Medientyp'] || null });
        if (foundEan && foundEan === ean) {
          rec.status = 'matched';
          rec.productUrl = url;
          rec.discCapacity = attrs['Medientyp'] ? normalizeCapacity(attrs['Medientyp']) : null;
          rec.specs = { bildformat: attrs['Bildformat'] || null, tonformat: attrs['Tonformat'] || null, laufzeit: attrs['Laufzeit'] || null, label: attrs['Label'] || null };
          break;
        }
      }
    } catch (e) {
      rec.status = 'error';
      rec.error = String(e.message || e);
    }

    results[m.id] = rec;
    if (rec.status === 'matched') matched++;
    const tag = rec.status === 'matched' ? (rec.discCapacity ? `✓ ${rec.discCapacity}` : '✓ (ohne Medientyp)') : rec.status === 'error' ? '✗ Fehler' : '– kein EAN-Treffer';
    console.log(`[${done}/${targets.length}] ${m.id} ${m.title}${boxShared ? ' [Box-EAN]' : ''} → ${tag}`);

    // Inkrementell speichern (wiederaufnehmbar).
    if (done % 5 === 0 || done === targets.length) fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));
    await sleep(250);
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));

  // SQL (nur Treffer mit Kapazität) + Review-Datei schreiben.
  const sql = ['-- Disc-Kapazität aus media-dealer (EAN-genau). In Supabase SQL-Editor ausführen.'];
  const review = ['# Disc-Kapazität – nicht automatisch zugeordnet', '', 'Bitte manuell prüfen (oder per Scan erfassen).', ''];
  let sqlCount = 0;
  for (const r of Object.values(results)) {
    if (r.status === 'matched' && r.discCapacity) {
      sql.push(`update movies set disc_capacity = '${sqlEscape(r.discCapacity)}' where id = '${r.id}';${r.boxShared ? ' -- ACHTUNG: Box-EAN (mehrere Filme)' : ''}`);
      sqlCount++;
    } else {
      const cands = (r.candidates || []).slice(0, 3).map((c) => `    - ${c.medientyp || '(kein Medientyp)'} · EAN ${c.ean || '?'} · ${c.url}`).join('\n');
      review.push(`- **${r.id} ${r.title}** (EAN ${r.ean}) – ${r.status}\n${cands || '    - keine Kandidaten'}`);
    }
  }
  fs.writeFileSync(OUT_SQL, sql.join('\n') + '\n');
  fs.writeFileSync(OUT_REVIEW, review.join('\n') + '\n');

  console.log(`\n✅ Fertig: ${matched}/${targets.length} per EAN zugeordnet.`);
  console.log(`   SQL-Updates (${sqlCount}): ${OUT_SQL}`);
  console.log(`   Zum Nachprüfen:            ${OUT_REVIEW}`);
  console.log(`   Rohdaten/Cache:            ${OUT_JSON}`);
}

main().catch((e) => {
  console.error('Abbruch:', e);
  process.exit(1);
});
