import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { useCatalog } from '../lib/catalogState';
import { useUserData } from '../lib/userData';
import { PosterImage } from '../components/PosterImage';
import { backdropUrl, formatRuntime, ratingPercent, yearLabel, fskLabel } from '../lib/format';
import { IconChevronLeft, IconStar, IconHome, IconCheck } from '../components/Icons';
import type { Movie } from '../types';

function MyRatingPanel({ movie }: { movie: Movie }) {
  const { entry, setSeen, setRating, setWatchCount } = useUserData();
  const e = entry(movie.id);
  const rating = e.rating ?? movie.rating ?? null;
  const seen = e.seen ?? movie.seen ?? false;
  const watchCount = e.watchCount ?? (seen ? 1 : 0);

  return (
    <section className="mt-5 rounded-xl bg-ink-800/60 p-4 ring-1 ring-white/5">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Meine Bewertung</h3>
        <span className="tabular-nums text-2xl font-bold text-accent-soft">
          {rating != null ? rating.toFixed(1) : '–'}
          <span className="text-sm font-normal text-zinc-500">/10</span>
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        step={0.1}
        value={rating ?? 7.5}
        onChange={(ev) => setRating(movie.id, Number(ev.target.value))}
        className="w-full accent-accent"
        aria-label="Bewertung"
      />
      <div className="mt-0.5 flex items-center justify-between text-[11px] text-zinc-500">
        <span>1,0</span>
        {rating != null ? (
          <button onClick={() => setRating(movie.id, null)} className="text-zinc-400 hover:underline">
            Bewertung löschen
          </button>
        ) : (
          <span>Regler ziehen zum Bewerten</span>
        )}
        <span>10,0</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => setSeen(movie.id, !seen)}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            seen ? 'bg-accent/15 text-accent-soft ring-1 ring-accent/40' : 'bg-ink-700 text-zinc-300 hover:bg-ink-600'
          }`}
        >
          <IconCheck width={16} height={16} />
          {seen ? 'Gesehen' : 'Als gesehen markieren'}
        </button>
        {seen && (
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <div className="flex items-center overflow-hidden rounded-lg border border-ink-600">
              <button onClick={() => setWatchCount(movie.id, watchCount - 1)} className="px-3 py-1.5 text-lg leading-none hover:bg-ink-700" aria-label="weniger">
                −
              </button>
              <span className="min-w-[3.5rem] px-2 text-center tabular-nums">{watchCount}× </span>
              <button onClick={() => setWatchCount(movie.id, watchCount + 1)} className="px-3 py-1.5 text-lg leading-none hover:bg-ink-700" aria-label="mehr">
                +
              </button>
            </div>
            <span className="text-xs text-zinc-500">gesehen</span>
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '' || value === '–') return null;
  return (
    <div className="flex gap-3 border-b border-ink-800 py-2 last:border-0">
      <dt className="w-32 shrink-0 text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm text-zinc-200">{value}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-accent/80">{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

function MiniPoster({ m }: { m: Movie }) {
  return (
    <Link to={`/film/${m.id}`} className="block">
      <div className="overflow-hidden rounded-lg ring-1 ring-white/5">
        <PosterImage movie={m} />
      </div>
      <p className="mt-1 truncate text-[11px] text-zinc-400">{m.title}</p>
    </Link>
  );
}

export function DetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const data = useData();
  const { showFranchise, showDirector } = useCatalog();
  const movie = id ? data.byId.get(id) : undefined;

  const goFranchise = (name: string) => {
    showFranchise(name);
    navigate('/');
  };
  const goDirector = (name: string) => {
    showDirector(name);
    navigate('/');
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  if (data.loading) return <div className="p-6 text-center text-zinc-500">Lädt…</div>;
  if (!movie)
    return (
      <div className="p-6 text-center text-zinc-400">
        <p className="mb-4">Film nicht gefunden.</p>
        <Link to="/" className="text-accent-soft hover:underline">
          Zurück zum Katalog
        </Link>
      </div>
    );

  const backdrop = backdropUrl(movie);
  const pct = ratingPercent(movie.tmdb?.rating);
  const byYear = (a: Movie, b: Movie) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title, 'de');
  const boxMates = movie.boxKey ? (data.boxes.get(movie.boxKey) ?? []).filter((m) => m.id !== movie.id).sort(byYear) : [];
  // "Weitere Exemplare" = andere Ausgaben DESSELBEN Films (gleiche Gruppe), nicht die
  // rohen duplicateIds (die teils auf andere Filme derselben Box verweisen).
  const versions = movie.groupId
    ? (data.groups.get(movie.groupId) ?? []).filter((m) => m.id !== movie.id)
    : [];
  // "Weitere Filme dieser Reihe" = andere Filme desselben Universums, je Film eine
  // (Primär-)Ausgabe, ohne diesen Film und ohne die bereits in der Box gezeigten.
  const boxGroupIds = new Set(boxMates.map((m) => m.groupId));
  const reihe = movie.universe
    ? [
        ...new Map(
          (data.byUniverse.get(movie.universe) ?? [])
            .filter((m) => m.groupId !== movie.groupId)
            .map((m) => [m.groupId, (m.groupId && data.groups.get(m.groupId)?.[0]) || m] as const),
        ).values(),
      ]
        .filter((m) => !boxGroupIds.has(m.groupId))
        .sort(byYear)
    : [];
  // "Mehr aus dem <Kategorie>-Universum" (z. B. Marvel/DC): breiter als die Reihe,
  // ohne die schon in Box/Reihe gezeigten Filme.
  const reiheGroupIds = new Set(reihe.map((m) => m.groupId));
  const kategorie = movie.category
    ? [
        ...new Map(
          data.movies
            .filter((m) => m.category === movie.category && m.groupId !== movie.groupId)
            .map((m) => [m.groupId, (m.groupId && data.groups.get(m.groupId)?.[0]) || m] as const),
        ).values(),
      ]
        .filter((m) => !boxGroupIds.has(m.groupId) && !reiheGroupIds.has(m.groupId))
        .sort(byYear)
    : [];

  return (
    <div className="mx-auto max-w-3xl pb-16">
      {/* Backdrop-Header */}
      <div className="relative h-56 w-full overflow-hidden bg-ink-850 sm:h-72">
        {backdrop && <img src={backdrop} alt="" className="h-full w-full object-cover opacity-60" />}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/40 to-transparent" />
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/50 py-1.5 pl-2 pr-3 text-sm text-zinc-100 backdrop-blur-sm hover:bg-black/70"
        >
          <IconChevronLeft width={18} height={18} /> Zurück
        </button>
        <Link
          to="/"
          className="absolute right-3 top-3 inline-flex items-center justify-center rounded-full bg-black/50 p-2 text-zinc-100 backdrop-blur-sm hover:bg-black/70"
          aria-label="Zur Startseite"
        >
          <IconHome width={18} height={18} />
        </Link>
      </div>

      <div className="px-4">
        {/* Kopf: Poster + Titel */}
        <div className="-mt-20 flex gap-4">
          <div className="w-28 shrink-0 overflow-hidden rounded-xl shadow-poster ring-1 ring-white/10 sm:w-32">
            <PosterImage movie={movie} />
          </div>
          <div className="min-w-0 flex-1 pt-20">
            <h1 className="text-xl font-bold leading-tight">{movie.title}</h1>
            {movie.originalTitle !== movie.title && (
              <p className="text-sm italic text-zinc-400">{movie.originalTitle}</p>
            )}
            <p className="mt-1 text-sm text-zinc-400">
              {[yearLabel(movie), movie.type, formatRuntime(movie.runtime)].filter(Boolean).join(' · ')}
            </p>
            {movie.directors.length > 0 && (
              <p className="mt-0.5 text-sm text-zinc-500">
                Regie:{' '}
                {movie.directors.map((d, i) => (
                  <span key={d}>
                    {i > 0 && ', '}
                    <button onClick={() => goDirector(d)} className="text-accent-soft/90 underline-offset-2 hover:underline">
                      {d}
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>

        {/* Ratings */}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          {pct != null && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-accent-soft">
                <IconStar width={18} height={18} />
                <span className="text-lg font-bold">{movie.tmdb?.rating?.toFixed(1)}</span>
              </div>
              <div className="w-24">
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  TMDB {pct}%{movie.tmdb?.votes ? ` · ${movie.tmdb.votes.toLocaleString('de-DE')} Stimmen` : ''}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Meine Bewertung / Gesehen (in der App gepflegt) */}
        <MyRatingPanel movie={movie} />

        {/* Genres */}
        {(movie.genres.length > 0 || movie.franchise) && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {movie.franchise && (
              <button
                onClick={() => goFranchise(movie.franchise!)}
                className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent-soft hover:bg-accent/25"
              >
                {movie.franchise} →
              </button>
            )}
            {movie.genres.map((g) => (
              <span key={g} className="rounded-full bg-ink-800 px-2.5 py-1 text-xs text-zinc-300">
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Kurzinhalt */}
        {movie.tmdb?.overview && <p className="mt-5 text-sm leading-relaxed text-zinc-300">{movie.tmdb.overview}</p>}

        {/* Technik */}
        <Block title="Bild & Ton">
          <Row label="Discformat" value={movie.discFormat} />
          <Row label="Discs" value={movie.discCountRaw} />
          <Row label="Natives 4K" value={movie.native4k} />
          <Row label="HDR" value={movie.hdr} />
          <Row label="Bildformat" value={movie.aspectRatio} />
          <Row label="Atmos" value={movie.atmos} />
          <Row label="OV-Tonspur" value={movie.audioOriginal} />
          <Row label="DE-Tonspur" value={movie.audioGerman} />
          <Row label="DE-Untertitel" value={movie.subtitlesDe} />
          <Row label="Laufzeit" value={formatRuntime(movie.runtime)} />
          <Row label="FSK" value={movie.fsk == null ? 'unbekannt' : fskLabel(movie.fsk)} />
          <Row label="Extended Cut" value={movie.extendedCut ? `Ja${movie.ecRuntime ? ` (${movie.ecRuntime})` : ''}` : null} />
        </Block>

        {/* Sammlung */}
        <Block title="Sammlung & Ausgabe">
          <Row label="Box/Sammlung" value={movie.box} />
          <Row label="Edition" value={movie.edition} />
          <Row label="Label" value={movie.label} />
          <Row label="EAN" value={movie.eanRaw} />
          <Row label="Bonusmaterial" value={movie.bonus} />
          <Row label="Digitale Kopie" value={movie.digitalCopy ? 'Ja' : null} />
          <Row label="Standort" value={movie.location} />
          <Row label="Verliehen an" value={movie.lentTo} />
        </Block>

        {/* Weitere Ausgaben desselben Films */}
        {versions.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent/80">
              Auch vorhanden als
            </h2>
            <div className="flex flex-wrap gap-2">
              {versions.map((m) => (
                <Link key={m.id} to={`/film/${m.id}`} className="rounded-lg bg-ink-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-ink-700">
                  {m.discFormat}
                  {m.title !== movie.title && <span className="text-zinc-500"> · {m.title}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Box-Geschwister */}
        {boxMates.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent/80">
              Weitere Filme dieser Box ({boxMates.length})
            </h2>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
              {boxMates.map((m) => (
                <MiniPoster key={m.id} m={m} />
              ))}
            </div>
          </section>
        )}

        {/* Weitere Filme dieser Reihe / desselben Universums */}
        {reihe.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent/80">
              Weitere Filme dieser Reihe ({reihe.length})
            </h2>
            {movie.universe !== movie.franchise && (
              <p className="mb-2 -mt-1 text-xs text-zinc-500">Universum: {movie.universe}</p>
            )}
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
              {reihe.map((m) => (
                <MiniPoster key={m.id} m={m} />
              ))}
            </div>
          </section>
        )}

        {/* Mehr aus dem Comic-Universum (Marvel / DC) */}
        {kategorie.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent/80">
              Mehr aus dem {movie.category}-Universum ({kategorie.length})
            </h2>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
              {kategorie.map((m) => (
                <MiniPoster key={m.id} m={m} />
              ))}
            </div>
          </section>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-600">{movie.id}</p>
      </div>
    </div>
  );
}
