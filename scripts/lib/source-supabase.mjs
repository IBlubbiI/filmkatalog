// =============================================================================
//  source-supabase.mjs  –  liest die Filme aus Supabase statt aus der Excel.
// =============================================================================
//  Aktiv, sobald SUPABASE_URL + SUPABASE_ANON_KEY (oder SUPABASE_KEY) gesetzt
//  sind. Die Spalten werden auf dieselben (deutschen) Schlüssel gemappt, die der
//  Build bisher aus der Excel verwendet – der Rest der Pipeline bleibt gleich.
// =============================================================================

// snake_case (DB) -> deutscher Schlüssel (wie bisher aus der Excel)
const COLMAP = {
  id: 'ID',
  title_de: 'Titel (DE)',
  title_original: 'Originaltitel',
  year: 'Jahr',
  director: 'Regie',
  franchise: 'Reihe/Franchise',
  genre: 'Genre',
  main_genre: 'Hauptgenre',
  disc_format: 'Discformat(e)',
  discs: 'Discs',
  edition: 'Edition/Verpackung',
  box: 'Box/Sammlung',
  label: 'Label',
  ean: 'EAN',
  fsk: 'FSK',
  runtime_min: 'Laufzeit (Min., ca.)',
  hdr: 'HDR',
  native_4k: 'Natives 4K',
  aspect_ratio: 'Bildformat',
  audio_ov: 'Beste OV-Tonspur',
  audio_de: 'Beste DE-Tonspur',
  atmos: 'Atmos?',
  extended_cut: 'Extended Cut?',
  ec_extra_runtime: 'EC Mehrlaufzeit',
  ec_on_disc: 'EC auf Disc',
  ec_audio: 'EC Tonspur',
  subtitles_de: 'DE-Untertitel',
  bonus: 'Bonusmaterial',
  digital_copy: 'Digitale Kopie',
  location: 'Standort',
  seen: 'Gesehen',
  rating: 'Bewertung (1–10)',
  lent_to: 'Verliehen an',
  type: 'Typ',
  other_copies: 'Weitere Exemplare (IDs)',
  category: 'Kategorie',
};

const KEY = () => process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || null;

export function supabaseConfigured() {
  return !!(process.env.SUPABASE_URL && KEY());
}

export async function fetchMoviesFromSupabase() {
  const url = process.env.SUPABASE_URL.replace(/\/+$/, '');
  const key = KEY();
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`${url}/rest/v1/movies?select=*&order=id.asc`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        Range: `${offset}-${offset + pageSize - 1}`,
        'Range-Unit': 'items',
      },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status} ${res.statusText}: ${await res.text().catch(() => '')}`);
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  // DB-Zeilen -> deutsch-benannte Zeilen (wie Excel), nur gesetzte Spalten übernehmen
  return all.map((row) => {
    const r = {};
    for (const [col, de] of Object.entries(COLMAP)) r[de] = row[col] ?? null;
    return r;
  });
}
