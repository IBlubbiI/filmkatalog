import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { PosterImage } from '../components/PosterImage';
import { IconChevronLeft, IconSearch, IconClose } from '../components/Icons';
import { SectionNav } from '../components/SectionNav';
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
interface SubGroup {
  label: string; // '' = keine Unterüberschrift (normale Reihe)
  list: Entry[];
}
interface Section {
  key: string;
  name: string;
  groups: SubGroup[];
}

// --- Kategorie-Universen (Marvel/DC): Hauptstory vs. Spin-offs -----------------
const MAIN_UNIVERSE: Record<string, string> = {
  Marvel: 'Marvel Cinematic Universe (MCU)',
  DC: 'DC Extended Universe (DCEU)',
};
const SHORT: Record<string, string> = { Marvel: 'MCU', DC: 'DCEU' };
const CATEGORY_ORDER = ['Marvel', 'DC'];
// Einzelne Korrekturen, wo das Reihen-Tag die Hauptstory-Zuordnung nicht trifft:
const FORCE_MAIN = new Set(['F417']); // Aquaman: Lost Kingdom – gehört zur DCEU-Hauptreihe
const FORCE_SPINOFF = new Set(['F415']); // Birds of Prey – Nebenstory, kein Teil der Hauptstory
const isMainStory = (m: Movie, cat: string) =>
  FORCE_MAIN.has(m.id) ? true : FORCE_SPINOFF.has(m.id) ? false : m.universe === MAIN_UNIVERSE[cat];

// Normale Reihen: besessene/Collection-Filme, die bewusst zu den Spin-offs gehören
// (kein Teil der nummerierten Hauptreihe). Schlüssel = TMDB-ID.
const FORCE_SPINOFF_TMDB = new Set<number>([
  330459, // Rogue One: A Star Wars Story – Anthology-Film, nicht Teil der Skywalker-Saga
]);

/** Baut die Einträge einer Film-Menge: eigene Filme + Sammlungs-Teile (+ optional Ableger). */
function entriesFromFilms(films: Movie[], data: ReturnType<typeof useData>, globalOwned: Map<number, Movie>, extraKeys: string[]): Entry[] {
  const raw = new Map<string | number, { title: string; year: string | null; poster: string | null; future: boolean; owned: Movie | null }>();
  const add = (id: string | number, title: string, year: string | null, poster: string | null, future: boolean) => {
    if (!raw.has(id)) raw.set(id, { title, year, poster, future, owned: null });
  };
  const collIds = new Set(films.map((f) => f.tmdb?.collection?.id).filter(Boolean) as number[]);
  for (const cid of collIds) for (const p of data.collections[cid]?.parts ?? []) add(p.tmdbId, p.title, p.year, p.poster, !!p.future);
  for (const key of extraKeys) for (const ex of data.collectionExtras[key] ?? []) add(ex.tmdbId, ex.title, ex.year, ex.poster, !!ex.future);
  // Besitz GLOBAL markieren (ein Titel kann in einer anderen Reihe besessen sein, z. B. Hexenjäger)
  for (const [id, e] of raw) if (typeof id === 'number') e.owned = globalOwned.get(id) ?? null;
  // eigene Filme ergänzen – auch die OHNE TMDB-Treffer (z. B. Sammelboxen)
  for (const f of films) {
    const id = f.tmdb?.tmdbId ?? `film:${f.id}`;
    const ex = raw.get(id);
    if (ex) ex.owned = f;
    else raw.set(id, { title: f.title, year: f.year ? String(f.year) : f.yearRaw, poster: null, future: false, owned: f });
  }
  return [...raw.entries()]
    .map(([id, e]): Entry => ({
      key: String(id),
      tmdbId: typeof id === 'number' ? id : null,
      title: e.title,
      year: e.year,
      poster: e.poster,
      owned: e.owned,
      status: e.owned ? 'owned' : e.future ? 'upcoming' : 'available',
    }))
    .sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999));
}

function buildSections(data: ReturnType<typeof useData>): Section[] {
  const primaries = [...data.groups.values()].map((g) => g[0]); // je Film eine (Primär-)Ausgabe
  const globalOwned = new Map<number, Movie>();
  for (const m of primaries) if (m.tmdb?.tmdbId) globalOwned.set(m.tmdb.tmdbId, m);

  // 1. Kategorie-Universen (Marvel, DC) – Hauptreihe (chronologisch) + Spin-offs
  const universes: Section[] = [];
  for (const cat of CATEGORY_ORDER) {
    const catFilms = primaries.filter((m) => m.category === cat);
    if (catFilms.length < 2) continue;
    // Hauptreihe: eigene Hauptstory-Filme + kanonische (nicht besessene) Titel aus `cat:<cat>`
    const mainList = entriesFromFilms(catFilms.filter((m) => isMainStory(m, cat)), data, globalOwned, [`cat:${cat}`]);
    const spinFilms = catFilms.filter((m) => !isMainStory(m, cat));
    const groups: SubGroup[] = [];
    if (mainList.length) groups.push({ label: `Hauptreihe · ${SHORT[cat]} · chronologisch`, list: mainList });
    if (cat === 'Marvel') {
      // Marvel-Spin-offs nach Sub-Reihe gruppieren (X-Men, Spider-Man, Venom, Hellboy, Ghost Rider …).
      const bySub = new Map<string, Movie[]>();
      for (const m of spinFilms) {
        const sub = m.universe || m.franchise || m.title.split(/[:–-]/)[0].trim();
        if (!bySub.has(sub)) bySub.set(sub, []);
        bySub.get(sub)!.push(m);
      }
      for (const [sub, films] of [...bySub.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'))) {
        const l = entriesFromFilms(films, data, globalOwned, []);
        if (l.length) groups.push({ label: `Spin-offs · ${sub}`, list: l });
      }
    } else {
      const spinList = entriesFromFilms(spinFilms, data, globalOwned, []);
      if (spinList.length) groups.push({ label: 'Spin-offs & weitere Filme', list: spinList });
    }
    if (groups.length) universes.push({ key: `cat:${cat}`, name: `${cat}-Universum`, groups });
  }

  // 2. Normale Reihen (kategorisierte Filme sind in den Universen oben)
  const byKey = new Map<string, { name: string; films: Movie[] }>();
  for (const m of primaries) {
    if (m.category) continue;
    const key = m.universe || m.franchise || (m.tmdb?.collection ? `col:${m.tmdb.collection.id}` : '');
    if (!key) continue;
    const name = m.universe || m.franchise || m.tmdb?.collection?.name || key;
    if (!byKey.has(key)) byKey.set(key, { name, films: [] });
    byKey.get(key)!.films.push(m);
  }
  for (const [key, { name, films }] of byKey) {
    const list = entriesFromFilms(films, data, globalOwned, [key]);
    if (list.length < 2) continue;
    // Hauptreihe (Collection-Filme + eigene + als Hauptreihe markierte Extras) vs.
    // Spin-offs (Ableger/Serien aus den Extras ohne `main`-Flag).
    const spinIds = new Set((data.collectionExtras[key] ?? []).filter((p) => !p.main).map((p) => p.tmdbId));
    for (const id of FORCE_SPINOFF_TMDB) spinIds.add(id);
    const main = list.filter((e) => !(e.tmdbId != null && spinIds.has(e.tmdbId)));
    const spin = list.filter((e) => e.tmdbId != null && spinIds.has(e.tmdbId));
    const groups =
      main.length && spin.length
        ? [
            { label: 'Hauptreihe', list: main },
            { label: 'Spin-offs & weitere Filme', list: spin },
          ]
        : [{ label: '', list }];
    universes.push({ key, name, groups });
  }
  // Universen + Reihen gemeinsam alphabetisch (Marvel/DC bekommen keine Sonderstellung).
  universes.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return universes;
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

/** Gehört zur Reihe, ist auf Disc erhältlich, aber (noch) nicht im Besitz. */
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
            <img src={`https://image.tmdb.org/t/p/w342${e.poster}`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-20 grayscale" />
          )}
        </div>
        <p className="mt-1 truncate px-0.5 text-[11px] text-zinc-500">{e.title}</p>
        <p className="truncate px-0.5 text-[10px] text-zinc-600">{e.year}</p>
      </div>
    </DiscoverLink>
  );
}

function EntryCard({ e }: { e: Entry }) {
  if (e.status === 'owned' && e.owned) return <OwnedCard m={e.owned} />;
  if (e.status === 'available') return <AvailableCard e={e} />;
  return <UpcomingCard e={e} />;
}

const GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8';

type Mode = 'all' | 'owned' | 'missing';
const MODES: { key: Mode; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'owned', label: 'Im Besitz' },
  { key: 'missing', label: 'Nicht im Besitz' },
];

// Scroll-Position über das Aus-/Einhängen der Seite hinweg merken (pro Sitzung).
let savedScroll = 0;

// Ansichtszustand (Modus, Toggle, Suche) über Seitenwechsel hinweg merken.
const VIEW_KEY = 'filmkatalog.sammlung.v1';
function loadView(): { mode: Mode; showUpcoming: boolean; q: string } {
  try {
    const p = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}');
    return { mode: MODES.some((m) => m.key === p.mode) ? p.mode : 'all', showUpcoming: !!p.showUpcoming, q: typeof p.q === 'string' ? p.q : '' };
  } catch {
    return { mode: 'all', showUpcoming: false, q: '' };
  }
}

export function SammlungPage() {
  const data = useData();
  const navigate = useNavigate();
  const sections = useMemo(() => buildSections(data), [data]);
  const init = loadView();
  const [mode, setMode] = useState<Mode>(init.mode);
  const [showUpcoming, setShowUpcoming] = useState(init.showUpcoming);
  const [query, setQuery] = useState(init.q);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ mode, showUpcoming, q: query }));
    } catch {
      /* localStorage nicht verfügbar → nur pro Sitzung */
    }
  }, [mode, showUpcoming, query]);

  useLayoutEffect(() => {
    if (savedScroll) window.scrollTo(0, savedScroll);
    const onScroll = () => {
      savedScroll = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const q = query.trim().toLowerCase();
  const keepEntry = (e: Entry) => {
    if (e.status === 'upcoming' && !showUpcoming) return false;
    if (mode === 'owned') return e.status === 'owned';
    if (mode === 'missing') return e.status !== 'owned';
    return true;
  };

  const shown = useMemo(() => {
    return sections
      .map((s) => {
        const nameMatch = !!q && s.name.toLowerCase().includes(q);
        const groups = s.groups
          .map((g) => ({ label: g.label, list: g.list.filter((e) => (!q || nameMatch || e.title.toLowerCase().includes(q)) && keepEntry(e)) }))
          .filter((g) => g.list.length > 0);
        return { ...s, groups };
      })
      .filter((s) => s.groups.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, mode, showUpcoming, q]);

  // Besessene Filme, die in KEINER Sektion erscheinen → unten als Einzeltitel.
  const standalone = useMemo(() => {
    const inSection = new Set<string>();
    for (const s of sections) for (const g of s.groups) for (const e of g.list) if (e.owned) inSection.add(e.owned.id);
    return [...data.groups.values()]
      .map((g) => g[0])
      .filter((m) => !inSection.has(m.id))
      .sort((a, b) => a.title.localeCompare(b.title, 'de'));
  }, [sections, data.groups]);
  const standaloneShown = mode === 'missing' ? [] : standalone.filter((m) => !q || m.title.toLowerCase().includes(q));

  const counts = (s: Section) => {
    const all = s.groups.flatMap((g) => g.list);
    return { owned: all.filter((e) => e.status === 'owned').length, releasable: all.filter((e) => e.status !== 'upcoming').length };
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 bg-ink-900/90 px-4 pb-2 pt-3 backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
              className="inline-flex items-center gap-1 rounded-full bg-ink-800 py-1.5 pl-2 pr-3 text-sm hover:bg-ink-700"
            >
              <IconChevronLeft width={18} height={18} /> Zurück
            </button>
            <h1 className="text-lg font-bold">Sammlung</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] text-zinc-500 sm:inline">{sections.length} Reihen</span>
            <SectionNav current="sammlung" />
          </div>
        </div>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="Reihe oder Titel suchen… (z. B. Marvel, Maze Runner)"
            className="w-full rounded-xl border border-ink-700 bg-ink-800 py-2 pl-10 pr-9 text-sm placeholder:text-zinc-600 focus:border-accent/60"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:bg-ink-700" aria-label="Suche löschen">
              <IconClose width={16} height={16} />
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 rounded-lg border border-ink-700 bg-ink-800 p-0.5 text-sm">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 font-medium transition-colors ${mode === m.key ? 'bg-ink-700 text-accent-soft' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowUpcoming((v) => !v)}
          aria-pressed={showUpcoming}
          title="Filme, für die noch kein DVD/Blu-ray/4K-Release feststeht"
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${showUpcoming ? 'border-accent/50 bg-ink-800 text-accent-soft' : 'border-ink-700 bg-ink-800 text-zinc-400 hover:text-zinc-200'}`}
        >
          <span className={`h-2 w-2 rounded-full ${showUpcoming ? 'bg-accent' : 'bg-zinc-600'}`} />
          Ohne Disc-Release
        </button>
        </div>
      </header>

      {data.loading ? (
        <p className="py-16 text-center text-zinc-500">Lädt…</p>
      ) : shown.length === 0 && standaloneShown.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">Keine Titel gefunden.</p>
      ) : (
        <div className="mt-4 space-y-8">
          {shown.map((s) => {
            const c = counts(s);
            const universe = s.key.startsWith('cat:');
            return (
              <section key={s.key} className="rounded-2xl border border-accent/25 bg-accent/[0.03] p-3 sm:p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className={`font-semibold text-zinc-100 ${universe ? 'text-base' : 'text-sm'}`}>{s.name}</h2>
                  <span className="text-[11px] text-zinc-500">
                    {c.owned} von {c.releasable}
                  </span>
                </div>
                {s.groups.map((g, i) => (
                  <div key={i} className={i > 0 ? 'mt-4' : ''}>
                    {g.label && <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{g.label}</h3>}
                    <div className={GRID}>
                      {g.list.map((e) => (
                        <EntryCard key={e.key} e={e} />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}

          {standaloneShown.length > 0 && (
            <section>
              <div className="mb-2 flex items-baseline justify-between border-t border-ink-800 pt-6">
                <h2 className="text-sm font-semibold text-zinc-100">Einzeltitel</h2>
                <span className="text-[11px] text-zinc-500">{standaloneShown.length} ohne Reihe</span>
              </div>
              <div className={GRID}>
                {standaloneShown.map((m) => (
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
