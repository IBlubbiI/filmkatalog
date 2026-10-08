// Client für die passwortgeschützte Edge Function "admin" (Schreibzugriff + TMDB)
// sowie direktes Lesen einer Roh-Zeile aus Supabase (für das Bearbeiten-Formular).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

const FN = `${SUPABASE_URL}/functions/v1/admin`;
const H = { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' };

export interface TmdbHit {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  originalTitle: string | null;
  year: string | null;
  poster: string | null;
  overview: string | null;
}
export interface TmdbDetail {
  title: string | null;
  original_title: string | null;
  year: string | null;
  director: string | null;
  genres: string[];
  runtime: number | null;
  poster: string | null;
}
// Roh-Zeile der Supabase-Tabelle (snake_case) – alle Felder optional.
export type MovieRow = Record<string, string | number | null | undefined> & { id?: string };

async function call(action: string, payload: Record<string, unknown>, password: string) {
  const res = await fetch(FN, { method: 'POST', headers: H, body: JSON.stringify({ action, password, ...payload }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Fehler ${res.status}`);
  return data;
}

export const admin = {
  search: (query: string, pw: string): Promise<TmdbHit[]> => call('search', { query }, pw).then((d) => d.results),
  detail: (tmdbId: number, type: string, pw: string): Promise<TmdbDetail> => call('detail', { tmdbId, type }, pw),
  nextId: (pw: string): Promise<string> => call('next_id', {}, pw).then((d) => d.id),
  upsert: (movie: MovieRow, pw: string): Promise<MovieRow> => call('upsert', { movie }, pw).then((d) => d.movie),
  remove: (id: string, pw: string): Promise<void> => call('remove', { id }, pw).then(() => undefined),
  publish: (pw: string): Promise<void> => call('publish', {}, pw).then(() => undefined),
  scan: (image: string, mime: string, pw: string): Promise<MovieRow> => call('scan', { image, mime }, pw).then((d) => d.fields || {}),
  uploadPoster: (id: string, image: string, mime: string, pw: string): Promise<string> =>
    call('upload_poster', { id, image, mime }, pw).then((d) => d.url as string),
};

// Prüft das Passwort über eine harmlose Aktion (next_id). Wirft bei falschem Passwort.
export const checkPassword = (pw: string) => admin.nextId(pw).then(() => true);

const READ_H = { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY };

// Eine Roh-Zeile direkt aus Supabase lesen (öffentlich lesbar).
export async function fetchRow(id: string): Promise<MovieRow | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/movies?id=eq.${encodeURIComponent(id)}&select=*`, { headers: READ_H });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

// Alle Zeilen lesen (für Autovervollständigung bestehender Feldwerte).
export async function fetchAllRows(): Promise<MovieRow[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/movies?select=*`, { headers: { ...READ_H, Range: '0-9999', 'Range-Unit': 'items' } });
  if (!res.ok) return [];
  return res.json();
}
