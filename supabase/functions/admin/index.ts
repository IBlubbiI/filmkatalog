// =============================================================================
//  Supabase Edge Function: "admin"
// =============================================================================
//  Serverseitiger Endpunkt für den In-App-Editor. Hält alle Keys geheim und ist
//  per Passwort geschützt. Aktionen (JSON-Body { action, password, ... }):
//    - search  { query }                 -> TMDB-Suche (Film/Serie)
//    - next_id                           -> nächste freie ID (F###)
//    - upsert  { movie }                 -> Film anlegen/ändern (service role)
//    - remove  { id }                    -> Film löschen
//    - publish                           -> GitHub-Deploy auslösen (repository_dispatch)
//
//  Secrets (Supabase → Edge Functions → Manage secrets):
//    ADMIN_PASSWORD   – Passwort für den Editor
//    TMDB_API_KEY     – TMDB v3 Key
//    GITHUB_TOKEN     – GitHub PAT (fine-grained: Contents RW genügt) für Deploy
//    GITHUB_REPO      – z. B. "IBlubbiI/filmkatalog"
//  (SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.)
// =============================================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TMDB_KEY = Deno.env.get('TMDB_API_KEY') ?? '';
const ADMIN_PW = Deno.env.get('ADMIN_PASSWORD') ?? '';
const GH_TOKEN = Deno.env.get('GITHUB_TOKEN') ?? '';
const GH_REPO = Deno.env.get('GITHUB_REPO') ?? '';

const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' };

async function tmdbSearch(query: string) {
  const u = new URL('https://api.themoviedb.org/3/search/multi');
  u.searchParams.set('api_key', TMDB_KEY);
  u.searchParams.set('language', 'de-DE');
  u.searchParams.set('query', query);
  u.searchParams.set('include_adult', 'false');
  const r = await fetch(u);
  const d = await r.json();
  return (d.results || [])
    .filter((x: any) => x.media_type === 'movie' || x.media_type === 'tv')
    .slice(0, 12)
    .map((x: any) => ({
      tmdbId: x.id,
      type: x.media_type,
      title: x.title || x.name,
      originalTitle: x.original_title || x.original_name,
      year: (x.release_date || x.first_air_date || '').slice(0, 4) || null,
      poster: x.poster_path || null,
      overview: x.overview || null,
    }));
}

async function nextId(): Promise<string> {
  const r = await fetch(`${SB_URL}/rest/v1/movies?select=id&order=id.desc&limit=1000`, { headers: sbHeaders });
  const rows = await r.json();
  let max = 0;
  for (const row of rows) {
    const m = String(row.id).match(/(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'F' + String(max + 1).padStart(3, '0');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST erwartet' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'ungültiges JSON' }, 400);
  }
  if (!ADMIN_PW || body.password !== ADMIN_PW) return json({ error: 'Passwort falsch' }, 401);

  try {
    switch (body.action) {
      case 'search':
        return json({ results: await tmdbSearch(String(body.query || '')) });

      case 'next_id':
        return json({ id: await nextId() });

      case 'detail': {
        const type = body.type === 'tv' ? 'tv' : 'movie';
        const u = new URL(`https://api.themoviedb.org/3/${type}/${body.tmdbId}`);
        u.searchParams.set('api_key', TMDB_KEY);
        u.searchParams.set('language', 'de-DE');
        u.searchParams.set('append_to_response', 'credits');
        const d = await (await fetch(u)).json();
        const date = type === 'tv' ? d.first_air_date : d.release_date;
        const dir = (d.credits?.crew || []).filter((c: any) => c.job === 'Director').map((c: any) => c.name);
        const creators = (d.created_by || []).map((c: any) => c.name);
        return json({
          title: d.title || d.name || null,
          original_title: d.original_title || d.original_name || null,
          year: (date || '').slice(0, 4) || null,
          director: (dir.length ? dir : creators).join(', ') || null,
          genres: (d.genres || []).map((g: any) => g.name),
          runtime: d.runtime || (d.episode_run_time || [])[0] || null,
          poster: d.poster_path || null,
        });
      }

      case 'scan': {
        const gkey = Deno.env.get('GEMINI_API_KEY');
        if (!gkey) return json({ error: 'GEMINI_API_KEY nicht gesetzt' }, 500);
        const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';
        const prompt =
          'Du erhältst ein Foto der Rückseite (oder Vorderseite) einer Film-Disc (DVD/Blu-ray/4K UHD). ' +
          'Lies alle erkennbaren Angaben aus und gib NUR ein JSON-Objekt mit genau diesen Schlüsseln zurück ' +
          '(Werte, die nicht erkennbar sind, als leeren String ""): ' +
          'title_de, title_original, year, director, disc_format, discs, native_4k, hdr, atmos, aspect_ratio, ' +
          'fsk, runtime_min, label, edition, ean, audio_ov, audio_de, subtitles_de, genre, bonus. ' +
          'Regeln: disc_format z.B. "4K UHD + Blu-ray" oder "Blu-ray"; native_4k und atmos jeweils "Ja" oder "Nein"; ' +
          'hdr z.B. "Dolby Vision, HDR10"; aspect_ratio z.B. "2.39:1"; year als vierstellige Zahl; ' +
          'runtime_min als Zahl (Minuten); ean nur Ziffern; audio_ov = beste Original-Tonspur, audio_de = beste deutsche Tonspur; ' +
          'genre als kommagetrennte Liste. Antworte ausschließlich mit dem JSON.';
        const gbody = {
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: body.mime || 'image/jpeg', data: body.image } }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        };
        const gr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gkey}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(gbody),
        });
        const gd = await gr.json();
        if (!gr.ok) return json({ error: `Gemini ${gr.status}: ${JSON.stringify(gd).slice(0, 300)}` }, 500);
        const text = gd.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        let fields: Record<string, unknown> = {};
        try {
          fields = JSON.parse(text);
        } catch {
          fields = {};
        }
        return json({ fields });
      }

      case 'upsert': {
        const movie = body.movie || {};
        if (!movie.id) movie.id = await nextId();
        const r = await fetch(`${SB_URL}/rest/v1/movies?on_conflict=id`, {
          method: 'POST',
          headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(movie),
        });
        if (!r.ok) return json({ error: `DB ${r.status}: ${await r.text()}` }, 500);
        return json({ ok: true, movie: (await r.json())[0] });
      }

      case 'remove': {
        const r = await fetch(`${SB_URL}/rest/v1/movies?id=eq.${encodeURIComponent(body.id)}`, {
          method: 'DELETE',
          headers: sbHeaders,
        });
        if (!r.ok) return json({ error: `DB ${r.status}: ${await r.text()}` }, 500);
        return json({ ok: true });
      }

      case 'publish': {
        if (!GH_TOKEN || !GH_REPO) return json({ error: 'GitHub nicht konfiguriert' }, 500);
        const r = await fetch(`https://api.github.com/repos/${GH_REPO}/dispatches`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'content-type': 'application/json', 'User-Agent': 'filmkatalog-admin' },
          body: JSON.stringify({ event_type: 'rebuild' }),
        });
        if (!r.ok) return json({ error: `GitHub ${r.status}: ${await r.text()}` }, 500);
        return json({ ok: true });
      }

      default:
        return json({ error: 'unbekannte Aktion' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
