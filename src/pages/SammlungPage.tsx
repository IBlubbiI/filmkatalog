import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { PosterImage } from '../components/PosterImage';
import { IconChevronLeft } from '../components/Icons';
import type { Movie } from '../types';

interface Entry {
  key: string;
  title: string;
  year: string | null;
  poster: string | null; // TMDB-Pfad (für Platzhalter)
  owned: Movie | null;
}
interface Series {
  key: string;
  name: string;
  list: Entry[];
  owned: number;
}

function buildSeries(data: ReturnType<typeof useData>): Series[] {
  const primaries = [...data.groups.values()].map((g) => g[0]); // je Film eine (Primär-)Ausgabe
  const byKey = new Map<string, { name: string; films: Movie[] }>();
  for (const m of primaries) {
    const key = m.universe || m.franchise || (m.tmdb?.collection ? `col:${m.tmdb.collection.id}` : '');
    if (!key) continue;
    const name = m.universe || m.franchise || m.tmdb?.collection?.name || key;
    if (!byKey.has(key)) byKey.set(key, { name, films: [] });
    byKey.get(key)!.films.push(m);
  }

  const result: Series[] = [];
  for (const [key, { name, films }] of byKey) {
    const ownedByTmdb = new Map(films.filter((f) => f.tmdb?.tmdbId).map((f) => [f.tmdb!.tmdbId, f]));
    const collIds = [...new Set(films.map((f) => f.tmdb?.collection?.id).filter(Boolean) as number[])];
    const entries = new Map<string | number, Entry>();
    for (const cid of collIds) {
      const coll = data.collections[cid];
      if (!coll) continue;
      for (const p of coll.parts) {
        if (!entries.has(p.tmdbId))
          entries.set(p.tmdbId, { key: `t${p.tmdbId}`, title: p.title, year: p.year, poster: p.poster, owned: ownedByTmdb.get(p.tmdbId) || null });
      }
    }
    // eigene Filme, die in keiner Sammlung stehen, als "besitze ich" ergänzen
    for (const f of films) {
      const tid = f.tmdb?.tmdbId;
      if (tid && entries.has(tid)) {
        entries.get(tid)!.owned = f;
        continue;
      }
      const k = tid ?? `film:${f.id}`;
      if (!entries.has(k)) entries.set(k, { key: String(k), title: f.title, year: f.year ? String(f.year) : f.yearRaw, poster: null, owned: f });
    }
    const list = [...entries.values()].sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999));
    if (list.length >= 2) result.push({ key, name, list, owned: list.filter((e) => e.owned).length });
  }
  result.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return result;
}

function PlaceholderCard({ e }: { e: Entry }) {
  return (
    <div className="opacity-70" title={`${e.title}${e.year ? ` (${e.year})` : ''} – noch nicht in der Sammlung`}>
      <div className="relative flex aspect-[2/3] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-ink-600 bg-ink-850">
        {e.poster && (
          <img
            src={`https://image.tmdb.org/t/p/w342${e.poster}`}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-20 grayscale"
          />
        )}
        <span className="relative rounded bg-ink-900/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          fehlt
        </span>
      </div>
      <p className="mt-1 truncate px-0.5 text-[11px] text-zinc-500">{e.title}</p>
      <p className="truncate px-0.5 text-[10px] text-zinc-600">{e.year}</p>
    </div>
  );
}

function OwnedCard({ m }: { m: Movie }) {
  return (
    <Link to={`/film/${m.id}`} className="group block">
      <div className="overflow-hidden rounded-xl shadow-poster ring-1 ring-white/5 transition-transform group-active:scale-[0.97]">
        <PosterImage movie={m} />
      </div>
      <p className="mt-1 truncate px-0.5 text-[11px] font-medium text-zinc-200">{m.title}</p>
      <p className="truncate px-0.5 text-[10px] text-zinc-500">{m.year ?? m.yearRaw}</p>
    </Link>
  );
}

export function SammlungPage() {
  const data = useData();
  const series = useMemo(() => buildSeries(data), [data]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 bg-ink-900/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Link to="/" className="inline-flex items-center gap-1 rounded-full bg-ink-800 py-1.5 pl-2 pr-3 text-sm hover:bg-ink-700">
            <IconChevronLeft width={18} height={18} /> Katalog
          </Link>
          <h1 className="text-lg font-bold">Sammlung</h1>
        </div>
        <span className="text-[11px] text-zinc-500">{series.length} Reihen</span>
      </header>

      {data.loading ? (
        <p className="py-16 text-center text-zinc-500">Lädt…</p>
      ) : series.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">Keine Reihen gefunden.</p>
      ) : (
        <div className="mt-4 space-y-8">
          {series.map((s) => (
            <section key={s.key}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-zinc-100">{s.name}</h2>
                <span className="text-[11px] text-zinc-500">
                  {s.owned} von {s.list.length}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {s.list.map((e) => (e.owned ? <OwnedCard key={e.key} m={e.owned} /> : <PlaceholderCard key={e.key} e={e} />))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
