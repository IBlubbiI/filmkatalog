import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { useUserData } from '../lib/userData';
import { NOTE_AUTHORS, NOTE_AUTHOR_KEY, authorColor } from '../lib/authors';
import { PosterImage } from '../components/PosterImage';
import { SectionNav } from '../components/SectionNav';
import { IconChevronLeft, IconBookmark, IconDice, IconCheck, IconClose } from '../components/Icons';
import { yearLabel, formatRuntime } from '../lib/format';
import type { Movie } from '../types';

type Who = string; // Autorname oder 'gemeinsam'
const GEMEINSAM = 'gemeinsam';

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function WatchlistPage() {
  const data = useData();
  const { data: userData, wishBy, toggleWish, toggleSeen } = useUserData();
  const navigate = useNavigate();

  const [who, setWho] = useState<Who>(() => {
    try {
      return localStorage.getItem(NOTE_AUTHOR_KEY) || NOTE_AUTHORS[0];
    } catch {
      return NOTE_AUTHORS[0];
    }
  });
  const [mode, setMode] = useState<'liste' | 'blaettern'>('liste');

  // Eindeutige Titel (Gruppen-Primär), damit nichts doppelt erscheint.
  const primaries = useMemo(() => [...data.groups.values()].map((g) => g[0]).filter(Boolean), [data.groups]);

  // Personen für die Auswahl (feste Reihenfolge + evtl. weitere aus den Daten).
  const people = useMemo(() => {
    const set = new Set<string>(NOTE_AUTHORS);
    for (const e of Object.values(userData)) for (const a of Object.keys(e.wishBy ?? {})) set.add(a);
    return [...set];
  }, [userData]);

  // Merkliste je Auswahl.
  const list = useMemo(() => {
    const rows: { movie: Movie; wanters: string[] }[] = [];
    for (const m of primaries) {
      const e = userData[m.id];
      if (!e?.wishBy) continue;
      const wanters = Object.entries(e.wishBy).filter(([, w]) => w.want).map(([a]) => a);
      if (!wanters.length) continue;
      if (who === GEMEINSAM) {
        if (wanters.length >= 2) rows.push({ movie: m, wanters });
      } else if (wanters.includes(who)) {
        // Für eine Person: schon von ihr Gesehenes ausblenden.
        if ((e.seenBy?.[who]?.count ?? 0) > 0) continue;
        rows.push({ movie: m, wanters });
      }
    }
    // Zuletzt gemerkte zuerst.
    rows.sort((a, b) => {
      const at = (r: { movie: Movie }) => {
        const wb = userData[r.movie.id]?.wishBy ?? {};
        return Math.max(0, ...Object.values(wb).filter((w) => w.want).map((w) => w.at));
      };
      return at(b) - at(a);
    });
    return rows;
  }, [primaries, userData, who]);

  // „Durchblättern": unentschiedene (ungesehene, nicht gemerkte) Filme der Person.
  const [queue, setQueue] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (mode !== 'blaettern' || who === GEMEINSAM) return;
    const pool = primaries.filter((m) => {
      const e = userData[m.id];
      const seen = (e?.seenBy?.[who]?.count ?? 0) > 0;
      const wished = !!e?.wishBy?.[who]?.want;
      return !seen && !wished;
    });
    setQueue(shuffle(pool).map((m) => m.id));
    setIdx(0);
    // nur beim Moduswechsel / Personenwechsel neu mischen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, who]);

  const current = mode === 'blaettern' ? data.byId.get(queue[idx] ?? '') : undefined;
  const next = () => setIdx((i) => i + 1);

  const pickRandom = () => {
    if (!list.length) return;
    navigate(`/film/${list[Math.floor(Math.random() * list.length)].movie.id}`);
  };

  const whoColor = who === GEMEINSAM ? undefined : authorColor(who);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 bg-ink-900/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
            className="inline-flex items-center gap-1 rounded-full bg-ink-800 py-1.5 pl-2 pr-3 text-sm hover:bg-ink-700"
          >
            <IconChevronLeft width={18} height={18} /> Zurück
          </button>
          <h1 className="text-lg font-bold">Merkliste</h1>
        </div>
        <SectionNav current="watchlist" />
      </header>

      {/* Für wen */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {[GEMEINSAM, ...people].map((a) => {
          const active = who === a;
          const c = a === GEMEINSAM ? undefined : authorColor(a);
          return (
            <button
              key={a}
              onClick={() => setWho(a)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active ? (c ? 'bg-ink-800' : 'border-accent bg-accent/15 text-accent-soft') : 'border-ink-600 text-zinc-400 hover:text-zinc-200'
              }`}
              style={active && c ? { color: c, borderColor: c } : undefined}
            >
              {a === GEMEINSAM ? 'Gemeinsam' : a}
            </button>
          );
        })}
      </div>

      {/* Modus + Aktionen */}
      <div className="mt-3 flex items-center justify-between gap-2">
        {who !== GEMEINSAM ? (
          <div className="flex gap-1 rounded-lg bg-ink-800 p-0.5">
            <button onClick={() => setMode('liste')} className={`rounded-md px-3 py-1.5 text-sm ${mode === 'liste' ? 'bg-ink-700 text-accent-soft' : 'text-zinc-400'}`}>
              Liste
            </button>
            <button onClick={() => setMode('blaettern')} className={`rounded-md px-3 py-1.5 text-sm ${mode === 'blaettern' ? 'bg-ink-700 text-accent-soft' : 'text-zinc-400'}`}>
              Durchblättern
            </button>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Filme, die mindestens zwei Personen sehen wollen.</p>
        )}
        {mode === 'liste' && list.length > 0 && (
          <button onClick={pickRandom} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-800 px-3 py-1.5 text-sm text-zinc-200 hover:border-ink-500">
            <IconDice width={15} height={15} /> Zufall
          </button>
        )}
      </div>

      {/* LISTE */}
      {mode === 'liste' && (
        <div className="mt-4">
          {list.length === 0 ? (
            <p className="rounded-xl bg-ink-800/60 p-4 text-sm text-zinc-500 ring-1 ring-white/5">
              {who === GEMEINSAM
                ? 'Noch keine gemeinsamen Filme – sobald zwei Personen denselben Film merken, erscheint er hier.'
                : 'Noch nichts gemerkt – über „Merken" auf einer Filmseite oder über „Durchblättern" hinzufügen.'}
            </p>
          ) : (
            <div className="space-y-1">
              {list.map(({ movie, wanters }) => (
                <div key={movie.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-ink-800">
                  <Link to={`/film/${movie.id}`} className="w-11 shrink-0 overflow-hidden rounded-md ring-1 ring-white/5">
                    <PosterImage movie={movie} />
                  </Link>
                  <Link to={`/film/${movie.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{movie.title}</p>
                    <p className="truncate text-xs text-zinc-500">{[yearLabel(movie), movie.mainGenre, formatRuntime(movie.runtime)].filter(Boolean).join(' · ')}</p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {who === GEMEINSAM
                      ? wanters.map((a) => <IconBookmark key={a} width={13} height={13} fill="currentColor" style={{ color: authorColor(a) }} />)
                      : (
                        <button onClick={() => toggleWish(movie.id, who)} className="rounded-full p-1.5 text-zinc-500 hover:bg-ink-700 hover:text-zinc-200" aria-label="Von Merkliste entfernen">
                          <IconClose width={15} height={15} />
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DURCHBLÄTTERN */}
      {mode === 'blaettern' && who !== GEMEINSAM && (
        <div className="mt-6 flex flex-col items-center">
          {current ? (
            <>
              <Link to={`/film/${current.id}`} className="w-48 overflow-hidden rounded-xl shadow-poster ring-1 ring-white/10">
                <PosterImage movie={current} />
              </Link>
              <h2 className="mt-4 text-center text-lg font-semibold">{current.title}</h2>
              <p className="text-sm text-zinc-400">{[yearLabel(current), current.mainGenre, formatRuntime(current.runtime)].filter(Boolean).join(' · ')}</p>
              <p className="mt-1 text-xs text-zinc-600">noch {queue.length - idx} unentschieden</p>
              <div className="mt-5 flex items-center gap-3">
                <button onClick={next} className="inline-flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-800 px-4 py-3 text-sm font-medium text-zinc-300 hover:border-ink-500">
                  <IconClose width={16} height={16} /> Überspringen
                </button>
                <button
                  onClick={() => { toggleWish(current.id, who); next(); }}
                  style={{ backgroundColor: whoColor }}
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold text-ink-950"
                >
                  <IconBookmark width={16} height={16} fill="currentColor" /> Merken
                </button>
              </div>
              <button
                onClick={() => { toggleSeen(current.id, who); next(); }}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
              >
                <IconCheck width={13} height={13} /> schon gesehen
              </button>
            </>
          ) : (
            <p className="rounded-xl bg-ink-800/60 p-4 text-center text-sm text-zinc-500 ring-1 ring-white/5">
              Durch – keine unentschiedenen Filme mehr für {who}.
              <br />
              <button onClick={() => setMode('liste')} className="mt-2 text-accent-soft hover:underline">Zur Merkliste</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
