import type { Movie } from '../types';

const BASE = import.meta.env.BASE_URL;

export function posterUrl(m: Movie): string | null {
  return m.tmdb?.poster ? BASE + m.tmdb.poster : null;
}
export function backdropUrl(m: Movie): string | null {
  return m.tmdb?.backdrop ? BASE + m.tmdb.backdrop : null;
}

export function formatRuntime(min: number | null): string | null {
  if (min == null) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} Min.`;
  return m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`;
}

/** TMDB vote_average (0–10) als Prozent. */
export function ratingPercent(r: number | null | undefined): number | null {
  return r == null ? null : Math.round(r * 10);
}

export function yearLabel(m: Movie): string {
  return m.yearRaw ?? (m.year != null ? String(m.year) : '');
}

/** kompakte Format-Badges fürs Poster (z. B. "4K", "BD", "DV"). */
export function formatBadges(m: Movie): string[] {
  const b: string[] = [];
  if (m.is4kDisc) b.push('4K');
  else if (m.hasBluray) b.push('BD');
  else if (m.hasDvd) b.push('DVD');
  if (m.hasDolbyVision) b.push('DV');
  else if (m.hasHdr) b.push('HDR');
  if (m.atmos === 'Ja') b.push('Atmos');
  return b;
}

export function fskLabel(fsk: number | null): string {
  return fsk == null ? 'FSK ?' : `FSK ${fsk}`;
}

/** Rang eines Discformats (höher = hochwertiger) – für die Wahl der Primär-Ausgabe. */
export function discFormatRank(f: string | null): number {
  if (!f) return 0;
  if (f.includes('4K UHD') && f.includes('Blu-ray')) return 4;
  if (f.includes('4K UHD')) return 3;
  if (f.includes('Blu-ray')) return 2;
  if (f === 'DVD') return 1;
  return 0;
}

/** Badges über ALLE Ausgaben eines Films (z. B. 4K + BD, wenn beide vorhanden). */
export function aggregateBadges(members: Movie[]): string[] {
  const any = (fn: (m: Movie) => boolean) => members.some(fn);
  const b: string[] = [];
  if (any((m) => m.is4kDisc)) b.push('4K');
  if (any((m) => m.hasBluray)) b.push('BD');
  if (any((m) => m.hasDvd)) b.push('DVD');
  if (any((m) => m.hasDolbyVision)) b.push('DV');
  else if (any((m) => m.hasHdr)) b.push('HDR');
  if (any((m) => m.atmos === 'Ja')) b.push('Atmos');
  return b;
}
