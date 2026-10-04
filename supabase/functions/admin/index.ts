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
  'Access-Control-Allow-Headers': 'content-type',
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
