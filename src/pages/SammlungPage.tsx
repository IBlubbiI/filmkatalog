import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { PosterImage } from '../components/PosterImage';
import { IconChevronLeft } from '../components/Icons';
import { formatBadges } from '../lib/format';
import type { Movie } from '../types';

type Status = 'owned' | 'available' | 'upcoming';

interface Entry {
  key: string;
  tmdbId: number | null; // für die Entdecken-Seite (nicht besessene Titel)
  title: string;
  year: string | null;
  poster: string | null; // TMDB-Pfad (für nicht besessene Titel)
  owned: Movie | null;
  status: Status; // owned = im Besitz · available = auf Disc erhältlich · upcoming = noch kein Disc-Release
}
interface Series {
  key: string;
  name: string;
  list: Entry[];
  owned: number; // im Besitz
  releasable: number; // im Besitz + auf Disc erhältlich (Nenner für "X von Y")
}

function buildSeries(data: ReturnType<typeof useData>): Series[] {
  const primaries = [...data.groups.values()].map((g) => g[0]); // je Film eine (Primär-)Ausgabe
  // Besitz GLOBAL nach TMDB-ID (nicht nur je Reihe): ein Film, den man in einer
  // anderen Reihe/Box besitzt, gilt auch hier als vorhanden (z. B. Hexenjäger).
  const globalOwned = new Map<number, Movie>();
  for (const m of primaries) if (m.tmdb?.tmdbId) globalOwned.set(m.tmdb.tmdbId, m);
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
    const collIds = [...new Set(films.map((f) => f.tmdb?.collection?.id).filter(Boolean) as number[])];
    const raw = new Map<string | number, { title: string; year: string | null; poster: string | null; future: boolean; owned: Movie | null }>();
    const add = (id: string | number, title: string, year: string | null, poster: string | null, future: boolean) => {
      if (!raw.has(id)) raw.set(id, { title, year, poster, future, owned: null });
    };
    for (const cid of collIds) {
      for (const p of data.collections[cid]?.parts ?? []) add(p.tmdbId, p.title, p.year, p.poster, !!p.future);
    }
    // Ableger/Fortsetzungen (automatisch entdeckt + manuell ergänzt)
    for (const ex of data.collectionExtras[key] ?? []) add(ex.tmdbId, ex.title, ex.year, ex.poster, !!ex.future);
    // Besitz GLOBAL markieren (ein Titel kann in einer anderen Reihe besessen sein)
    for (const [id, e] of raw) if (typeof id === 'number') e.owned = globalOwned.get(id) ?? null;
    // eigene Filme dieser Reihe ergänzen – auch die OHNE TMDB-Treffer (z. B. Sammelboxen),
    // sonst erscheinen sie fälschlich als "nicht im Besitz".
    for (const f of films) {
      const id = f.tmdb?.tmdbId ?? `film:${f.id}`;
      const existing = raw.get(id);
      if (existing) existing.owned = f;
      else raw.set(id, { title: f.title, year: f.year ? String(f.year) : f.yearRaw, poster: null, future: false, owned: f });
    }

    const list: Entry[] = [...raw.entries()].map(([id, e]): Entry => ({
      key: String(id),
      tmdbId: typeof id === 'number' ? id : null,
      title: e.title,
      year: e.year,
      poster: e.poster,
      owned: e.owned,
      // besitze ich · schon erschienen (erhältlich) · noch nicht erschienen (angekündigt)
      status: e.owned ? 'owned' : e.future ? 'upcoming' : 'available',
    }));
    list.sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999));
    if (list.length < 2) continue;
    result.push({
      key,
      name,
      list,
      owned: list.filter((e) => e.status === 'owned').length,
      releasable: list.filter((e) => e.status !== 'upcoming').length,
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return result;
}

/** Format-Badges (4K/BD/DV/DVD) über alle Ausgaben eines Films. */
function CardBadges({ m }: { m: Movie }) {
  const { groupBadges } = useData();
  const badges = groupBadges.get(m.id) ?? formatBadges(m);
  if (!badges.length) return null;
  return (
    <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex flex-wrap gap-1">
      {badges.map((b) => (
        <span key={b} className="rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold tracking-wide text-zinc-100 backdrop-blur-sm">
          {b}
        </span>
      ))}
    </div>
  );
}

function OwnedCard({ m }: { m: Movie }) {
  return (
    <Link to={`/film/${m.id}`} className="group block">
      <div className="relative overflow-hidden rounded-xl shadow-poster ring-1 ring-white/5 transition-transform group-active:scale-[0.97]">
        <PosterImage movie={m} />
        <CardBadges m={m} />
      </div>
      <p className="mt-1 truncate px-0.5 text-[11px] font-medium text-zinc-200">{m.title}</p>
      <p className="truncate px-0.5 text-[10px] text-zinc-500">{m.year ?? m.yearRaw}</p>
    </Link>
  );
}

/** Klickbarer Wrapper → Entdecken-Detailseite (nur wenn tmdbId vorhanden). */
function DiscoverLink({ e, children }: { e: Entry; children: ReactNode }) {
  if (e.tmdbId == null) return <>{children}</>;
  return (
    <Link to={`/entdecken/${e.tmdbId}`} className="block">
      {children}
    </Link>
  );
}

/** Gehört zur Reihe, ist auf Disc erhältlich, aber (noch) nicht im Besitz.
 *  Deutlich abgesetzt von besessenen Titeln: entsättigt, abgedunkelt, Rahmen. */
function AvailableCard({ e }: { e: Entry }) {
  return (
    <DiscoverLink e={e}>
      <div className="group" title={`${e.title}${e.year ? ` (${e.year})` : ''} – auf Disc erhältlich, nicht im Besitz`}>
        <div className="relative overflow-hidden rounded-xl border border-dashed border-ink-600">
          {e.poster ? (
            <img
              src={`https://image.tmdb.org/t/p/w342${e.poster}`}
              alt=""
              loading="lazy"
              className="aspect-[2/3] w-full object-cover opacity-45 grayscale transition group-hover:opacity-70 group-hover:grayscale-0"
            />
          ) : (
            <div className="flex aspect-[2/3] items-center justify-center bg-ink-850 px-2 text-center text-[11px] text-zinc-500">{e.title}</div>
          )}
          <div className="absolute inset-0 bg-ink-950/30" />
          <span className="absolute left-1.5 top-1.5 rounded bg-ink-950/85 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-300 ring-1 ring-white/10">
            nicht im Besitz
          </span>
        </div>
        <p className="mt-1 truncate px-0.5 text-[11px] text-zinc-500">{e.title}</p>
        <p className="truncate px-0.5 text-[10px] text-zinc-600">{e.year}</p>
      </div>
    </DiscoverLink>
  );
}

/** Gehört zur Reihe, aber es gibt noch keinen Disc-Release (angekündigt / künftig). */
function UpcomingCard({ e }: { e: Entry }) {
  return (
    <DiscoverLink e={e}>
      <div className="opacity-70 transition hover:opacity-100" title={`${e.title}${e.year ? ` (${e.year})` : ''} – noch kein Disc-Release`}>
        <div className="relative flex aspect-[2/3] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-ink-600 bg-ink-850">
          {e.poster && (
            <img
              src={`https://image.tmdb.org/t/p/w342${e.poster}`}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-20 grayscale"
            />
          )}
        </div>
        <p className="mt-1 truncate px-0.5 text-[11px] text-zinc-500">{e.title}</p>
        <p className="truncate px-0.5 text-[10px] text-zinc-600">{e.year}</p>
      </div>
    </DiscoverLink>
  );
}

type Mode = 'all' | 'owned' | 'missing';
const MODES: { key: Mode; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'owned', label: 'Im Besitz' },
  { key: 'missing', label: 'Nicht im Besitz' },
];

// Scroll-Position der Sammlung merken, damit "Zurück" (Detail → Sammlung) an der
// gleichen Stelle weitermacht statt nach oben zu springen. Modul-Variable = bleibt
// über das Aus-/Einhängen der Seite hinweg erhalten (pro Sitzung).
let savedScroll = 0;

// Ansichtszustand über Seitenwechsel (z. B. Detail → Zurück) hinweg merken.
const VIEW_KEY = 'filmkatalog.sammlung.v1';
function loadView(): { mode: Mode; showUpcoming: boolean } {
  try {
    const p = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}');
    return { mode: MODES.some((m) => m.key === p.mode) ? p.mode : 'all', showUpcoming: !!p.showUpcoming };
  } catch {
    return { mode: 'all', showUpcoming: false };
  }
}

export function SammlungPage() {
  const data = useData();
  const series = useMemo(() => buildSeries(data), [data]);
  const [mode, setMode] = useState<Mode>(() => loadView().mode);
  const [showUpcoming, setShowUpcoming] = useState(() => loadView().showUpcoming); // angekündigte (ohne Disc-Release) per Default aus

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ mode, showUpcoming }));
    } catch {
      /* localStorage nicht verfügbar → Zustand bleibt eben nur pro Sitzung */
    }
  }, [mode, showUpcoming]);

  // Scroll-Position wiederherstellen (vor dem Paint, kein Springen) + laufend merken.
  useLayoutEffect(() => {
    if (savedScroll) window.scrollTo(0, savedScroll);
    const onScroll = () => {
      savedScroll = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const shown = useMemo(
    () =>
      series
        .map((s) => ({
          ...s,
          list: s.list.filter((e) => {
            if (e.status === 'upcoming' && !showUpcoming) return false;
            if (mode === 'owned') return e.status === 'owned';
            if (mode === 'missing') return e.status !== 'owned';
            return true;
          }),
        }))
        .filter((s) => s.list.length > 0),
    [series, mode, showUpcoming],
  );

  // Alle besessenen Filme, die in KEINER Reihe erscheinen → unten als Einzeltitel.
  const standalone = useMemo(() => {
    const inSeries = new Set<string>();
    for (const s of series) for (const e of s.list) if (e.owned) inSeries.add(e.owned.id);
    return [...data.groups.values()]
      .map((g) => g[0])
      .filter((m) => !inSeries.has(m.id))
      .sort((a, b) => a.title.localeCompare(b.title, 'de'));
  }, [series, data.groups]);
  const showStandalone = mode !== 'missing' && standalone.length > 0;

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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-1 rounded-lg border border-ink-700 bg-ink-800 p-0.5 text-sm">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors ${
                mode === m.key ? 'bg-ink-700 text-accent-soft' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowUpcoming((v) => !v)}
          aria-pressed={showUpcoming}
          title="Filme, für die noch kein DVD/Blu-ray/4K-Release feststeht"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            showUpcoming ? 'border-accent/50 bg-ink-800 text-accent-soft' : 'border-ink-700 bg-ink-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${showUpcoming ? 'bg-accent' : 'bg-zinc-600'}`} />
          Ohne Disc-Release
        </button>
      </div>

      {data.loading ? (
        <p className="py-16 text-center text-zinc-500">Lädt…</p>
      ) : shown.length === 0 && !showStandalone ? (
        <p className="py-16 text-center text-zinc-500">Keine Titel gefunden.</p>
      ) : (
        <div className="mt-4 space-y-8">
          {shown.map((s) => (
            <section key={s.key}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-zinc-100">{s.name}</h2>
                <span className="text-[11px] text-zinc-500">
                  {s.owned} von {s.releasable}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {s.list.map((e) =>
                  e.status === 'owned' && e.owned ? (
                    <OwnedCard key={e.key} m={e.owned} />
                  ) : e.status === 'available' ? (
                    <AvailableCard key={e.key} e={e} />
                  ) : (
                    <UpcomingCard key={e.key} e={e} />
                  ),
                )}
              </div>
            </section>
          ))}

          {showStandalone && (
            <section>
              <div className="mb-2 flex items-baseline justify-between border-t border-ink-800 pt-6">
                <h2 className="text-sm font-semibold text-zinc-100">Einzeltitel</h2>
                <span className="text-[11px] text-zinc-500">{standalone.length} ohne Reihe</span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {standalone.map((m) => (
                  <OwnedCard key={m.id} m={m} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
