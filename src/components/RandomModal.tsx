import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Movie } from '../types';
import { PosterImage } from './PosterImage';
import { yearLabel, formatRuntime, formatBadges } from '../lib/format';
import { IconClose, IconDice } from './Icons';

interface Props {
  movies: Movie[];
  onClose: () => void;
}

const pick = (arr: Movie[]) => arr[Math.floor(Math.random() * arr.length)];

export function RandomModal({ movies, onClose }: Props) {
  const [movie, setMovie] = useState<Movie | null>(() => (movies.length ? pick(movies) : null));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xs animate-fade-in">
        <button onClick={onClose} className="absolute -top-10 right-0 rounded-full p-2 text-zinc-300 hover:bg-white/10" aria-label="Schließen">
          <IconClose />
        </button>
        {movie ? (
          <div className="flex flex-col items-center">
            <Link to={`/film/${movie.id}`} onClick={onClose} className="w-48 overflow-hidden rounded-xl shadow-poster ring-1 ring-white/10">
              <PosterImage movie={movie} />
            </Link>
            <h2 className="mt-4 text-center text-lg font-semibold">{movie.title}</h2>
            <p className="text-sm text-zinc-400">
              {[yearLabel(movie), movie.mainGenre, formatRuntime(movie.runtime)].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-1">
              {formatBadges(movie).map((b) => (
                <span key={b} className="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">
                  {b}
                </span>
              ))}
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setMovie(pick(movies))}
                className="inline-flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:border-ink-500"
              >
                <IconDice width={16} height={16} /> Nochmal
              </button>
              <Link
                to={`/film/${movie.id}`}
                onClick={onClose}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-ink-950 hover:bg-accent-soft"
              >
                Zum Film
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-center text-zinc-300">Keine Filme in der aktuellen Auswahl.</p>
        )}
      </div>
    </div>
  );
}
