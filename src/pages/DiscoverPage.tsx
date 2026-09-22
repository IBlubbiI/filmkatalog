import { useParams, Link } from 'react-router-dom';
import { useData, type DiscoverCast } from '../lib/data';
import { IconChevronLeft } from '../components/Icons';

const IMG = (path: string | null | undefined, size = 'w342') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);

function Cast({ cast }: { cast?: DiscoverCast[] }) {
  if (!cast?.length) return null;
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-zinc-300">Besetzung</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cast.map((c, i) => (
          <div key={i} className="w-20 shrink-0 text-center">
            <div className="mb-1 aspect-square overflow-hidden rounded-full bg-ink-800 ring-1 ring-white/10">
              {c.profile ? (
                <img src={IMG(c.profile, 'w185')!} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
                  {c.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </div>
              )}
            </div>
            <p className="truncate text-[11px] font-medium text-zinc-300">{c.name}</p>
            {c.character && <p className="truncate text-[10px] text-zinc-500">{c.character}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DiscoverPage() {
  const data = useData();
  const { tmdbId } = useParams();
  const entry = data.discoverById.get(Number(tmdbId));

  if (data.loading) return <p className="py-16 text-center text-zinc-500">Lädt…</p>;
  if (!entry) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-zinc-500">
        <p className="mb-4">Kein Eintrag gefunden.</p>
        <Link to="/sammlung" className="rounded-lg bg-ink-800 px-4 py-2 text-sm text-accent-soft hover:bg-ink-700">
          Zur Sammlung
        </Link>
      </div>
    );
  }

  const isTv = entry.type === 'tv';
  const meta = [
    entry.year,
    isTv ? (entry.seasons ? `${entry.seasons} Staffel${entry.seasons > 1 ? 'n' : ''}` : 'Serie') : entry.runtime ? `${entry.runtime} Min.` : null,
    entry.rating ? `★ ${entry.rating.toFixed(1)}` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl pb-20">
      {entry.backdrop && (
        <div className="relative -mb-24 h-56 w-full overflow-hidden sm:h-72">
          <img src={IMG(entry.backdrop, 'w780')!} alt="" className="h-full w-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/60 to-transparent" />
        </div>
      )}

      <header className="sticky top-0 z-10 flex items-center gap-2 px-4 py-3">
        <Link to="/sammlung" className="inline-flex items-center gap-1 rounded-full bg-ink-800/80 py-1.5 pl-2 pr-3 text-sm backdrop-blur-md hover:bg-ink-700">
          <IconChevronLeft width={18} height={18} /> Sammlung
        </Link>
      </header>

      <div className="relative px-4">
        <div className="flex gap-4">
          <div className="w-28 shrink-0 sm:w-36">
            <div className="overflow-hidden rounded-xl shadow-poster ring-1 ring-white/10">
              {IMG(entry.poster) ? (
                <img src={IMG(entry.poster)!} alt="" className="aspect-[2/3] w-full object-cover" />
              ) : (
                <div className="flex aspect-[2/3] items-center justify-center bg-ink-800 px-2 text-center text-xs text-zinc-500">{entry.title}</div>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1 pt-2">
            <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${entry.future ? 'bg-amber-500/15 text-amber-300' : 'bg-ink-700 text-zinc-300'}`}>
              {entry.future ? 'noch nicht erschienen' : 'nicht im Besitz'}
            </span>
            <h1 className="mt-1.5 text-xl font-bold leading-tight">{entry.title}</h1>
            <p className="mt-1 text-sm text-zinc-400">{meta.join(' · ')}</p>
          </div>
        </div>

        {entry.overview && <p className="mt-5 text-sm leading-relaxed text-zinc-300">{entry.overview}</p>}

        <Cast cast={entry.cast} />

        <a
          href={`https://www.themoviedb.org/${isTv ? 'tv' : 'movie'}/${entry.tmdbId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-lg bg-ink-800 px-4 py-2 text-sm text-accent-soft hover:bg-ink-700"
        >
          Auf TMDB ansehen ↗
        </a>
        <p className="mt-3 text-[11px] text-zinc-600">Infos von TMDB · Titel (noch) nicht in deiner Sammlung.</p>
      </div>
    </div>
  );
}
