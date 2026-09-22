import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { useCatalog } from '../lib/catalogState';
import { useUserData } from '../lib/userData';
import { applyFilters, emptyFilters, activeCount } from '../lib/filters';
import { sortMovies, SORTS } from '../lib/sort';
import { makeFuse, searchMovies } from '../lib/search';
import type { Movie } from '../types';
import { MovieCard, MovieRow } from '../components/MovieCard';
import { FilterSheet } from '../components/FilterSheet';
import { ActiveChips } from '../components/ActiveChips';
import { RandomModal } from '../components/RandomModal';
import { IconSearch, IconFilter, IconGrid, IconList, IconDice, IconChart, IconClose, IconLayers } from '../components/Icons';

/** Ausgaben desselben Films zu einer Karte zusammenfassen (Primär = beste Disc). */
function collapse(list: Movie[], groups: Map<string, Movie[]>): Movie[] {
  const seen = new Set<string>();
  const out: Movie[] = [];
  for (const m of list) {
    const gid = m.groupId ?? m.id;
    if (seen.has(gid)) continue;
    seen.add(gid);
    out.push(groups.get(gid)?.[0] ?? m);
  }
  return out;
}

export function CatalogPage() {
  const data = useData();
  const { data: userData } = useUserData();
  const { filters, setFilters, sort, setSort, view, setView, search, setSearch } = useCatalog();
  const [filterOpen, setFilterOpen] = useState(false);
  const [randomOpen, setRandomOpen] = useState(false);

  // App-eigene Bewertungen/Gesehen über die Excel-Werte legen (für Filter & Sortierung)
  const movies = useMemo(
    () =>
      data.movies.map((m) => {
        const u = userData[m.id];
        if (!u) return m;
        return { ...m, seen: u.seen ?? m.seen, rating: u.rating ?? m.rating };
      }),
    [data.movies, userData],
  );

  const filtered = useMemo(() => applyFilters(movies, filters), [movies, filters]);
  const fuse = useMemo(() => makeFuse(filtered), [filtered]);
  const searching = search.trim().length >= 2;
  const results = useMemo(() => {
    const ordered = searchMovies(filtered, fuse, search) ?? sortMovies(filtered, sort);
    return collapse(ordered, data.groups);
  }, [filtered, fuse, search, sort, data.groups]);

  const nActive = activeCount(filters);
  const stand = data.doc
    ? new Date(data.doc.generatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="mx-auto max-w-6xl pb-28">
      <header className="sticky top-0 z-20 bg-ink-900/90 px-4 pb-2 pt-3 backdrop-blur-md">
        <div className="mb-2.5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Filmkatalog</h1>
            <p className="text-[11px] text-zinc-500">
              {data.uniqueCount} Titel · {data.movies.length} Ausgaben{stand && ` · Stand ${stand}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Link to="/sammlung" className="inline-flex items-center gap-1.5 rounded-full bg-ink-800 py-1.5 pl-2.5 pr-3 text-sm text-zinc-200 hover:bg-ink-700" aria-label="Sammlung">
              <IconLayers width={18} height={18} /> Sammlung
            </Link>
            <Link to="/stats" className="rounded-full p-2 text-zinc-300 hover:bg-ink-800" aria-label="Statistik">
              <IconChart />
            </Link>
          </div>
        </div>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="Titel, Originaltitel, Regie…"
            className="w-full rounded-xl border border-ink-700 bg-ink-800 py-2.5 pl-10 pr-9 text-sm placeholder:text-zinc-600 focus:border-accent/60"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:bg-ink-700" aria-label="Suche löschen">
              <IconClose width={16} height={16} />
            </button>
          )}
        </div>
      </header>

      <div className="px-4">
        <div className="flex items-center justify-between gap-2 py-2.5">
          <div className="flex rounded-lg border border-ink-700 bg-ink-800 p-0.5">
            <button onClick={() => setView('grid')} className={`rounded-md p-1.5 ${view === 'grid' ? 'bg-ink-700 text-accent-soft' : 'text-zinc-400'}`} aria-label="Raster">
              <IconGrid width={18} height={18} />
            </button>
            <button onClick={() => setView('list')} className={`rounded-md p-1.5 ${view === 'list' ? 'bg-ink-700 text-accent-soft' : 'text-zinc-400'}`} aria-label="Liste">
              <IconList width={18} height={18} />
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            Sortieren
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as (typeof SORTS)[number]['key'])}
              disabled={searching}
              className="rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-xs text-zinc-200 focus:border-accent/60 disabled:opacity-50"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <ActiveChips state={filters} setState={setFilters} />

        <p className="py-2 text-xs text-zinc-500">
          {results.length} Titel
          {searching && ' (nach Relevanz)'}
        </p>

        {data.loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center text-zinc-500">
            <p className="mb-3">Keine Treffer.</p>
            <button onClick={() => { setFilters(emptyFilters()); setSearch(''); }} className="rounded-lg bg-ink-800 px-4 py-2 text-sm text-accent-soft hover:bg-ink-700">
              Filter zurücksetzen
            </button>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {results.map((m) => (
              <MovieCard key={m.id} movie={m} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {results.map((m) => (
              <MovieRow key={m.id} movie={m} />
            ))}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center gap-3 bg-gradient-to-t from-ink-900 via-ink-900/95 to-transparent px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-5">
        <button
          onClick={() => setFilterOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-bold text-ink-950 shadow-lg shadow-black/40 hover:bg-accent-soft"
        >
          <IconFilter width={18} height={18} />
          Filter
          {nActive > 0 && <span className="rounded-full bg-ink-950/25 px-1.5 text-xs">{nActive}</span>}
        </button>
        <button
          onClick={() => setRandomOpen(true)}
          disabled={results.length === 0}
          className="inline-flex items-center justify-center rounded-full bg-ink-750 px-4 py-3 text-zinc-100 shadow-lg shadow-black/40 ring-1 ring-white/10 hover:bg-ink-700 disabled:opacity-40"
          aria-label="Überrasch mich"
        >
          <IconDice />
        </button>
      </div>

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} movies={movies} state={filters} setState={setFilters} />
      {randomOpen && <RandomModal movies={results} onClose={() => setRandomOpen(false)} />}
    </div>
  );
}
