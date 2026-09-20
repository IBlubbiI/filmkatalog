import { Link } from 'react-router-dom';
import type { Movie } from '../types';
import { PosterImage } from './PosterImage';
import { formatBadges, yearLabel, formatRuntime } from '../lib/format';
import { useData } from '../lib/data';
import { useUserData } from '../lib/userData';
import { IconStar, IconCheck } from './Icons';

function SeenBadge() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/90 text-ink-950 shadow" title="Gesehen">
      <IconCheck width={13} height={13} strokeWidth={2.6} />
    </span>
  );
}

function RatingPill({ movie, className = '' }: { movie: Movie; className?: string }) {
  const r = movie.tmdb?.rating;
  if (r == null || r === 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-accent-soft backdrop-blur-sm ${className}`}
    >
      <IconStar width={11} height={11} />
      {r.toFixed(1)}
    </span>
  );
}

/** Eigene Bewertung: gold gefüllt mit dunkler Schrift – klar abgesetzt von der (dunklen) TMDB-Pille. */
function OwnRatingPill({ rating }: { rating: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-bold text-ink-950 shadow ring-1 ring-black/10"
      title="Meine Bewertung"
    >
      <IconStar width={11} height={11} />
      {rating.toFixed(1)}
    </span>
  );
}

function Badges({ movie, badges }: { movie: Movie; badges: string[] }) {
  if (!badges.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b}
          className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-zinc-200 backdrop-blur-sm"
        >
          {b}
        </span>
      ))}
    </div>
  );
}

/** Grid-Karte (Poster im Mittelpunkt). */
export function MovieCard({ movie }: { movie: Movie }) {
  const { groupBadges } = useData();
  const { entry } = useUserData();
  const badges = groupBadges.get(movie.id) ?? formatBadges(movie);
  const u = entry(movie.id);
  const seen = u.seen ?? movie.seen ?? false;
  const ownRating = u.rating ?? movie.rating ?? null;
  return (
    <Link
      to={`/film/${movie.id}`}
      className="group block focus-visible:ring-2"
      aria-label={`${movie.title}${movie.year ? `, ${movie.year}` : ''}`}
    >
      <div className="relative overflow-hidden rounded-xl shadow-poster ring-1 ring-white/5 transition-transform duration-200 group-active:scale-[0.97]">
        <PosterImage movie={movie} />
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-1.5">
          <div className="flex flex-col items-end gap-1">
            <RatingPill movie={movie} />
            {ownRating != null && <OwnRatingPill rating={ownRating} />}
          </div>
          <div className="flex items-end justify-between gap-1">
            <Badges movie={movie} badges={badges} />
            {seen && <SeenBadge />}
          </div>
        </div>
        {movie.type === 'Serie' && (
          <span className="absolute left-1.5 top-1.5 rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-bold text-ink-950">
            SERIE
          </span>
        )}
      </div>
      <div className="mt-1.5 px-0.5">
        <p className="truncate text-[13px] font-medium leading-tight text-zinc-100">{movie.title}</p>
        <p className="truncate text-[11px] text-zinc-500">
          {yearLabel(movie)}
          {movie.mainGenre ? ` · ${movie.mainGenre}` : ''}
        </p>
      </div>
    </Link>
  );
}

/** Kompakte Listenzeile. */
export function MovieRow({ movie }: { movie: Movie }) {
  const { groupBadges } = useData();
  const badges = groupBadges.get(movie.id) ?? formatBadges(movie);
  const rt = formatRuntime(movie.runtime);
  return (
    <Link
      to={`/film/${movie.id}`}
      className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-ink-800 active:bg-ink-800"
    >
      <div className="w-11 shrink-0 overflow-hidden rounded-md ring-1 ring-white/5">
        <PosterImage movie={movie} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-100">
          {movie.title}
          {movie.type === 'Serie' && <span className="ml-1.5 text-[10px] font-bold text-accent">SERIE</span>}
        </p>
        <p className="truncate text-xs text-zinc-500">
          {[yearLabel(movie), movie.mainGenre, badges.join(' · ') || movie.discFormat, rt].filter(Boolean).join(' · ')}
        </p>
      </div>
      <RatingPill movie={movie} className="shrink-0" />
    </Link>
  );
}
