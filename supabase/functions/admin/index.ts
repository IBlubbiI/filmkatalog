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
          'Lies alle erkennbaren Angaben aus und gib NUR ein JSON-Objekt mit genau diesen Schlüsseln zurück: ' +
          'title_de, title_original, year, director, disc_format, discs, disc_capacity, native_4k, hdr, atmos, aspect_ratio, ' +
          'fsk, runtime_min, label, edition, ean, audio_ov, audio_de, subtitles_de, genre, bonus. ' +
          'WICHTIG: Was nicht klar erkennbar ist, als leeren String "" zurückgeben – NIEMALS Platzhalter wie ' +
          '"nicht ermittelt", "unbekannt" oder erklärende Sätze. Nur der reine Wert oder "". ' +
          'Normiere die Werte kanonisch: ' +
          'disc_format z.B. "4K UHD + Blu-ray", "Blu-ray", "Blu-ray + DVD", "DVD". ' +
          'disc_capacity = Anzahl, Typ und Kapazität der Discs wie auf der Hülle angegeben, ' +
          'z.B. "1x UHD Blu-ray (100 GB), 2x Blu-ray Disc (50 GB)" – wenn keine GB-Angabe erkennbar, leer lassen. ' +
          'native_4k und atmos jeweils "Ja" oder "Nein". ' +
          'hdr nur die Formate, z.B. "Dolby Vision, HDR10", "HDR10", "HDR10+". ' +
          'aspect_ratio als reines Verhältnis, z.B. "2.39:1", "1.85:1", "1.78:1 (16:9)" – ohne Zusatztext. ' +
          'fsk nur die Zahl (0/6/12/16/18). year vierstellige Zahl. runtime_min Zahl in Minuten. ean nur Ziffern. ' +
          'audio_ov = beste Original-Tonspur, audio_de = beste deutsche Tonspur – jeweils NUR das Tonformat OHNE Sprache, ' +
          'z.B. "Dolby Atmos", "DTS-HD MA 7.1", "DTS-HD MA 5.1", "Dolby Digital 5.1", "Dolby Digital 2.0". ' +
          'subtitles_de z.B. "Deutsch" oder "" wenn keine. genre als kommagetrennte deutsche Genres. ' +
          'Antworte ausschließlich mit dem JSON.';
        const gbody = {
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: body.mime || 'image/jpeg', data: body.image } }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        };
        // Gemini-503/429 sind meist kurze Lastspitzen → mit Backoff erneut versuchen,
        // optional ein stabileres Fallback-Modell (Secret GEMINI_MODEL_FALLBACK).
        const fallback = Deno.env.get('GEMINI_MODEL_FALLBACK') || '';
        const models = fallback && fallback !== model ? [model, fallback] : [model];
        let gd: any = null;
        let lastErr = 'keine Antwort';
        for (const m of models) {
          let ok = false;
          for (let attempt = 0; attempt < 3; attempt++) {
            const gr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${gkey}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(gbody),
            });
            gd = await gr.json().catch(() => ({}));
            if (gr.ok) {
              ok = true;
              break;
            }
            lastErr = `${m} ${gr.status}: ${JSON.stringify(gd).slice(0, 180)}`;
            if (![429, 500, 502, 503].includes(gr.status)) break; // dauerhafter Fehler → nicht wiederholen
            await new Promise((r) => setTimeout(r, 800 * 2 ** attempt)); // 0,8s · 1,6s · 3,2s
          }
          if (ok) break;
        }
        if (!gd?.candidates) return json({ error: `Gemini ${lastErr}` }, 503);
        const text = gd.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        let fields: Record<string, unknown> = {};
        try {
          fields = JSON.parse(text);
        } catch {
          fields = {};
        }
        return json({ fields });
      }

      case 'upload_poster': {
        // Eigenes Poster in den Storage-Bucket "posters" legen, öffentliche URL zurückgeben.
        if (!body.id || !body.image) return json({ error: 'id/image fehlt' }, 400);
        const mime = String(body.mime || 'image/jpeg');
        const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
        const path = `${body.id}.${ext}`;
        const bytes = Uint8Array.from(atob(String(body.image)), (c) => c.charCodeAt(0));
        const up = await fetch(`${SB_URL}/storage/v1/object/posters/${path}`, {
          method: 'POST',
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'content-type': mime, 'x-upsert': 'true' },
          body: bytes,
        });
        if (!up.ok) return json({ error: `Storage ${up.status}: ${await up.text()}` }, 500);
        return json({ ok: true, url: `${SB_URL}/storage/v1/object/public/posters/${path}?v=${Date.now()}` });
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
