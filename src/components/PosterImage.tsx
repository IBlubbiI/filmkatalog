import { useState } from 'react';
import type { Movie } from '../types';
import { posterUrl } from '../lib/format';

interface Props {
  movie: Movie;
  className?: string;
}

/** Poster mit Lazy-Loading, Skeleton und Titel-Platzhalter (kein TMDB-Poster). */
export function PosterImage({ movie, className = '' }: Props) {
  const url = posterUrl(movie);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const showPlaceholder = !url || failed;

  return (
    <div className={`relative aspect-[2/3] overflow-hidden bg-ink-800 ${className}`}>
      {showPlaceholder ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-ink-750 to-ink-850 p-3 text-center">
          <span className="text-2xl opacity-30">🎬</span>
          <span className="line-clamp-4 text-xs font-medium leading-tight text-zinc-400">{movie.title}</span>
        </div>
      ) : (
        <>
          {!loaded && <div className="skeleton absolute inset-0" />}
          <img
            src={url}
            alt={movie.title}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          />
        </>
      )}
    </div>
  );
}
