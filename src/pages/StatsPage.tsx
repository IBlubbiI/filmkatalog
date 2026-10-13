import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData } from '../lib/data';
import { useUserData } from '../lib/userData';
import { useDriveSync } from '../lib/driveSync';
import { useCatalog } from '../lib/catalogState';
import { NOTE_AUTHORS, NOTE_AUTHOR_KEY, authorColor } from '../lib/authors';
import { IconChevronLeft, IconStar } from '../components/Icons';
import { SectionNav } from '../components/SectionNav';
import type { Movie } from '../types';
import type { FilterState } from '../lib/filters';

function DriveSync() {
  const s = useDriveSync();
  const time = s.lastSync ? new Date(s.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div className="mt-4 border-t border-ink-700/70 pt-4">
      <h3 className="mb-1 text-sm font-semibold text-zinc-200">Geräte-Sync über Google Drive</h3>
      {!s.enabled ? (
        <p className="text-xs text-zinc-500">Wird gerade eingerichtet – danach lassen sich Tablet & Handy hier verbinden.</p>
      ) : s.status === 'connected' ? (
        <div>
          <p className="mb-2 text-xs text-accent-soft">
            ✓ Mit Google Drive verbunden{time ? ` · zuletzt abgeglichen ${time}` : ''}
            {s.syncing ? ' · synchronisiere …' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={s.syncNow} disabled={s.syncing} className="rounded-lg bg-ink-700 px-3 py-2 text-sm text-zinc-200 hover:bg-ink-600 disabled:opacity-40">
              Jetzt synchronisieren
            </button>
            <button onClick={s.disconnect} className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-ink-700">
              Trennen
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs text-zinc-500">
            Google-Konto verbinden, damit die Bewertungen automatisch zwischen den Geräten abgeglichen werden.
          </p>
          <button
            onClick={s.connect}
            disabled={s.status === 'connecting'}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-bold text-ink-950 hover:bg-accent-soft disabled:opacity-50"
          >
            {s.status === 'connecting' ? 'Verbinde …' : 'Mit Google Drive verbinden'}
          </button>
          {s.status === 'error' && s.error && <p className="mt-2 text-xs text-red-300/80">Fehler: {s.error}</p>}
        </div>
      )}
    </div>
  );
}

function MyDataSection() {
  const { data, count, exportJSON, importJSON, clearAll } = useUserData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const entries = Object.values(data);
  const seen = entries.filter((e) => e.seen).length;
  const rated = entries.filter((e) => e.rating != null).length;

  return (
    <section className="mt-8 rounded-xl bg-ink-800/60 p-4 ring-1 ring-white/5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-accent/80">Bewertungen & Daten</h2>
      <p className="mb-3 text-xs text-zinc-500">
        {count === 0
          ? 'Noch keine – Bewertung erfolgt auf der jeweiligen Detailseite.'
          : `${seen} gesehen · ${rated} bewertet. Gespeichert auf diesem Gerät.`}
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={exportJSON} disabled={count === 0} className="rounded-lg bg-ink-700 px-3 py-2 text-sm text-zinc-200 hover:bg-ink-600 disabled:opacity-40">
          Sichern (Export)
        </button>
        <button onClick={() => fileRef.current?.click()} className="rounded-lg bg-ink-700 px-3 py-2 text-sm text-zinc-200 hover:bg-ink-600">
          Import
        </button>
        {count > 0 && (
          <button
            onClick={() => {
              if (confirm('Alle App-Bewertungen auf diesem Gerät löschen?')) clearAll();
            }}
            className="rounded-lg px-3 py-2 text-sm text-red-300/80 hover:bg-red-900/20"
          >
            Zurücksetzen
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setMsg((await importJSON(f)).msg);
            e.target.value = '';
          }}
        />
      </div>
      {msg && <p className="mt-2 text-xs text-accent-soft">{msg}</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
        Hinweis: Diese Bewertungen liegen auf diesem Gerät (nicht in der Excel). „Sichern" legt eine Datei zum
        Aufbewahren an – alternativ unten Google Drive für den automatischen Abgleich zwischen den Geräten verbinden.
      </p>

      <DriveSync />
    </section>
  );
}

function tally(movies: Movie[], key: (m: Movie) => string | null): [string, number][] {
  const map = new Map<string, number>();
  for (const m of movies) {
    const k = key(m);
    if (k == null) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function BarList({ title, rows, max }: { title: string; rows: [string, number][]; max?: number }) {
  const top = max ?? Math.max(...rows.map((r) => r[1]), 1);
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent/80">{title}</h2>
      <div className="space-y-1.5">
        {rows.map(([label, n]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-xs text-zinc-400">{label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-ink-800">
              <div className="h-full rounded bg-accent/70" style={{ width: `${(n / top) * 100}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-zinc-400">{n}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ value, label, color, small, onClick }: { value: string; label: string; color?: string; small?: boolean; onClick?: () => void }) {
  const inner = (
    <>
      <p className={`${small ? 'text-base' : 'text-2xl'} font-bold leading-tight`} style={{ color: color ?? undefined }}>
        <span className={color ? '' : 'text-accent-soft'}>{value}</span>
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </>
  );
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="flex flex-col justify-center rounded-xl bg-ink-800 p-4 text-center ring-1 ring-transparent transition-colors hover:bg-ink-750 hover:ring-accent/30"
      >
        {inner}
      </button>
    );
  }
  return <div className="flex flex-col justify-center rounded-xl bg-ink-800 p-4 text-center">{inner}</div>;
}

/** Platzierungsliste (Top-Filme / am häufigsten gesehen), Zeilen klickbar → Detailseite. */
function RankList({
  title,
  rows,
  onPick,
  suffix,
}: {
  title: string;
  rows: { id: string; title: string; value: string }[];
  onPick: (id: string) => void;
  suffix?: string;
}) {
  if (!rows.length) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent/80">{title}</h2>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <button
            key={r.id}
            onClick={() => onPick(r.id)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-ink-800"
          >
            <span className="w-4 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-600">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{r.title}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-accent-soft">
              {r.value}
              {suffix ? <span className="ml-0.5 text-xs font-normal text-zinc-500">{suffix}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

const DAY = 86_400_000;

/** Persönliche Statistiken aus den eigenen App-Daten – pro Person oder für alle (Haushalt). */
function PersonalStats() {
  const data = useData();
  const { data: userData } = useUserData();
  const navigate = useNavigate();

  // Für wen gelten die Statistiken: null = alle (Haushalt), sonst eine Person.
  const [person, setPerson] = useState<string | null>(() => {
    try {
      return localStorage.getItem(NOTE_AUTHOR_KEY) || NOTE_AUTHORS[0];
    } catch {
      return NOTE_AUTHORS[0];
    }
  });

  // Alle vorkommenden Personen (aus Bewertungen + „gesehen") für die Auswahl.
  const people = useMemo(() => {
    const set = new Set<string>(NOTE_AUTHORS);
    for (const e of Object.values(userData)) {
      for (const a of Object.keys(e.ratings ?? {})) set.add(a);
      for (const a of Object.keys(e.seenBy ?? {})) set.add(a);
    }
    return [...set];
  }, [userData]);

  const anyData = useMemo(
    () => Object.values(userData).some((e) => e.seen || e.rating != null || e.seenBy || e.ratings),
    [userData],
  );

  const p = useMemo(() => {
    const now = Date.now();
    let seenTotal = 0;
    let lastMonth = 0;
    let lastYear = 0;
    let seenMinutes = 0;
    const ownRatings: number[] = [];
    const byAuthor: Record<string, number[]> = {};
    const dist = new Map<number, number>(); // gerundete Note 1–10 → Anzahl
    const topRated: { id: string; title: string; value: string }[] = [];
    const rewatched: { id: string; title: string; value: string }[] = [];
    const disagree: { id: string; title: string; value: string; sp: number }[] = []; // größte Bewertungs-Differenz

    for (const [id, e] of Object.entries(userData)) {
      const movie = data.byId.get(id);
      // „gesehen": für die gewählte Person bzw. (null) den gesamten Haushalt
      let seen = false;
      let when = 0;
      let views = 0;
      if (person) {
        const s = e.seenBy?.[person];
        views = s?.count ?? 0;
        seen = views > 0;
        when = s?.at ?? 0;
      } else {
        seen = !!e.seen;
        views = e.watchCount ?? (e.seen ? 1 : 0);
        when = e.seenAt ?? e.updatedAt ?? 0;
      }
      if (seen) {
        seenTotal++;
        if (when && now - when <= 31 * DAY) lastMonth++;
        if (when && now - when <= 365 * DAY) lastYear++;
        if (movie?.runtime) seenMinutes += movie.runtime;
        if (views >= 2 && movie) rewatched.push({ id, title: movie.title, value: String(views) });
      }
      // Bewertung: der Person bzw. (null) die Gesamtwertung
      const val = person ? e.ratings?.[person]?.value ?? null : e.rating ?? null;
      if (val != null) {
        ownRatings.push(val);
        const bucket = Math.min(10, Math.max(1, Math.round(val)));
        dist.set(bucket, (dist.get(bucket) ?? 0) + 1);
        if (movie) topRated.push({ id, title: movie.title, value: val.toFixed(1) });
      }
      // Autor-Durchschnitte & „uneinig" nur in der „Alle"-Ansicht
      if (!person) {
        const vals: number[] = [];
        for (const [a, r] of Object.entries(e.ratings ?? {})) {
          if (r.value != null) {
            (byAuthor[a] ??= []).push(r.value);
            vals.push(r.value);
          }
        }
        if (vals.length >= 2 && movie) {
          const sp = Math.max(...vals) - Math.min(...vals);
          if (sp > 0) disagree.push({ id, title: movie.title, value: `Δ ${sp.toFixed(1)}`, sp });
        }
      }
    }

    const avg = ownRatings.length ? ownRatings.reduce((a, b) => a + b, 0) / ownRatings.length : null;
    const authorAvgs = person
      ? []
      : NOTE_AUTHORS.concat(Object.keys(byAuthor).filter((a) => !NOTE_AUTHORS.includes(a)))
          .filter((a) => byAuthor[a]?.length)
          .map((a) => ({ author: a, avg: byAuthor[a].reduce((x, y) => x + y, 0) / byAuthor[a].length, n: byAuthor[a].length }));
    const distRows: [string, number][] = [];
    for (let n = 10; n >= 1; n--) distRows.push([String(n), dist.get(n) ?? 0]);

    topRated.sort((a, b) => Number(b.value) - Number(a.value));
    rewatched.sort((a, b) => Number(b.value) - Number(a.value));
    disagree.sort((a, b) => b.sp - a.sp);

    return {
      disagree: disagree.slice(0, 6).map(({ id, title, value }) => ({ id, title, value })),
      seenTotal,
      lastMonth,
      lastYear,
      hours: Math.round(seenMinutes / 60),
      quote: data.uniqueCount ? Math.round((seenTotal / data.uniqueCount) * 100) : 0,
      avg,
      authorAvgs,
      distRows: ownRatings.length ? distRows : [],
      topRated: topRated.slice(0, 8),
      rewatched: rewatched.slice(0, 6),
      hasAny: seenTotal > 0 || ownRatings.length > 0,
    };
  }, [userData, data.byId, data.uniqueCount, person]);

  if (!anyData) {
    return (
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent/80">Film-Aktivität</h2>
        <p className="rounded-xl bg-ink-800/60 p-4 text-xs text-zinc-500 ring-1 ring-white/5">
          Noch keine Daten – Filme auf der Detailseite als „gesehen" markieren und bewerten, dann erscheinen hier die
          persönlichen Statistiken.
        </p>
      </section>
    );
  }

  const who = person ?? 'alle zusammen';

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent/80">Film-Aktivität</h2>

      {/* Für wen: Alle (Haushalt) oder eine Person */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[null, ...people].map((a) => {
          const active = person === a;
          const c = a ? authorColor(a) : undefined;
          return (
            <button
              key={a ?? 'alle'}
              type="button"
              onClick={() => setPerson(a)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active ? (c ? 'bg-ink-800' : 'border-accent bg-accent/15 text-accent-soft') : 'border-ink-600 text-zinc-400 hover:text-zinc-200'
              }`}
              style={active && c ? { color: c, borderColor: c } : undefined}
            >
              {a ?? 'Alle'}
            </button>
          );
        })}
      </div>

      {!p.hasAny ? (
        <p className="rounded-xl bg-ink-800/60 p-4 text-xs text-zinc-500 ring-1 ring-white/5">
          Für {who} gibt es noch keine „gesehen"- oder Bewertungs-Daten.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat value={String(p.lastMonth)} label="letzter Monat" />
            <Stat value={String(p.lastYear)} label="letztes Jahr" />
            <Stat value={String(p.seenTotal)} label="gesehen gesamt" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat value={p.avg != null ? p.avg.toFixed(1) : '–'} label="Ø Bewertung" color={person ? authorColor(person) : undefined} />
            <Stat value={`${p.quote}%`} label="Sammlung gesehen" />
            <Stat value={`${p.hours} h`} label="Laufzeit gesehen" />
          </div>

          {p.authorAvgs.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-3">
              {p.authorAvgs.map((a) => (
                <Stat key={a.author} value={a.avg.toFixed(1)} label={`Ø ${a.author} · ${a.n}`} color={authorColor(a.author)} />
              ))}
            </div>
          )}

          {p.distRows.length > 0 && <BarList title="Verteilung der Bewertungen" rows={p.distRows} />}

          <RankList title="Top-Filme" rows={p.topRated} onPick={(id) => navigate(`/film/${id}`)} />
          <RankList title="Am häufigsten gesehen" rows={p.rewatched} onPick={(id) => navigate(`/film/${id}`)} suffix="×" />
          {!person && <RankList title="Größte Diskrepanz" rows={p.disagree} onPick={(id) => navigate(`/film/${id}`)} />}

          <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
            „Letzter Monat/Jahr" zählt, wann ein Film als gesehen markiert wurde. Für ältere Einträge ohne Datum gilt der
            letzte Änderungszeitpunkt – ab jetzt wird das Datum exakt erfasst.
          </p>
        </>
      )}
    </section>
  );
}

// Daten-Qualitäts-Prüfungen (je Titel, auf Basis der gebauten Daten).
const DATA_CHECKS: { key: string; label: string; test: (m: Movie) => boolean }[] = [
  { key: 'tmdb', label: 'Kein TMDB-Treffer', test: (m) => !m.tmdb },
  { key: 'poster', label: 'Kein Poster', test: (m) => !m.posterUrl && !m.tmdb?.poster },
  { key: 'year', label: 'Kein Jahr', test: (m) => m.year == null },
  { key: 'fsk', label: 'Keine FSK', test: (m) => m.fsk == null },
  { key: 'genre', label: 'Kein Hauptgenre', test: (m) => !m.mainGenre },
  { key: 'runtime', label: 'Keine Laufzeit', test: (m) => m.runtime == null },
];

/** Daten-Check: Titel mit fehlenden/unvollständigen Angaben – zum schnellen Nachpflegen. */
function DataQuality() {
  const data = useData();
  const [open, setOpen] = useState<string | null>(null);

  const results = useMemo(() => {
    const primaries = [...data.groups.values()].map((g) => g[0]).filter(Boolean);
    return DATA_CHECKS.map((c) => ({ ...c, films: primaries.filter(c.test).sort((a, b) => a.title.localeCompare(b.title, 'de')) })).filter((c) => c.films.length > 0);
  }, [data.groups]);

  if (!results.length) {
    return (
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent/80">Daten-Check</h2>
        <p className="rounded-xl bg-ink-800/60 p-4 text-xs text-zinc-500 ring-1 ring-white/5">Alles vollständig – keine fehlenden Angaben gefunden. 🎉</p>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent/80">Daten-Check</h2>
      <div className="space-y-1.5">
        {results.map((c) => (
          <div key={c.key} className="overflow-hidden rounded-lg bg-ink-800/60 ring-1 ring-white/5">
            <button onClick={() => setOpen((o) => (o === c.key ? null : c.key))} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-ink-800">
              <span className="text-sm text-zinc-200">
                {open === c.key ? '▾' : '▸'} {c.label}
              </span>
              <span className="shrink-0 rounded-full bg-ink-700 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-300">{c.films.length}</span>
            </button>
            {open === c.key && (
              <div className="border-t border-ink-700/70 px-3 py-2">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {c.films.map((m) => (
                    <Link key={m.id} to={`/film/${m.id}`} className="truncate text-xs text-accent-soft/90 hover:underline">
                      {m.title}
                      {m.year ? ` (${m.year})` : m.yearRaw ? ` (${m.yearRaw})` : ''}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Jahresrückblick: was in einem Kalenderjahr gesehen wurde (pro Person oder Haushalt). */
function JahresRueckblick() {
  const data = useData();
  const { data: userData } = useUserData();
  const navigate = useNavigate();

  // Jahre, in denen überhaupt etwas als gesehen markiert wurde.
  const years = useMemo(() => {
    const s = new Set<number>();
    for (const e of Object.values(userData)) {
      for (const sb of Object.values(e.seenBy ?? {})) if ((sb.count ?? 0) > 0 && sb.at) s.add(new Date(sb.at).getFullYear());
      if (e.seen && e.seenAt) s.add(new Date(e.seenAt).getFullYear());
    }
    return [...s].sort((a, b) => b - a);
  }, [userData]);

  const people = useMemo(() => {
    const set = new Set<string>(NOTE_AUTHORS);
    for (const e of Object.values(userData)) for (const a of Object.keys(e.seenBy ?? {})) set.add(a);
    return [...set];
  }, [userData]);

  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [person, setPerson] = useState<string | null>(() => {
    try {
      return localStorage.getItem(NOTE_AUTHOR_KEY) || NOTE_AUTHORS[0];
    } catch {
      return NOTE_AUTHORS[0];
    }
  });
  const activeYear = years.includes(year) ? year : years[0];

  const r = useMemo(() => {
    const months = new Array(12).fill(0);
    const genre = new Map<string, number>();
    let minutes = 0;
    const films: { id: string; title: string; value: string }[] = [];
    for (const [id, e] of Object.entries(userData)) {
      let when = 0;
      if (person) {
        const sb = e.seenBy?.[person];
        if (!sb || (sb.count ?? 0) <= 0) continue;
        when = sb.at;
      } else {
        if (!e.seen || !e.seenAt) continue;
        when = e.seenAt;
      }
      const d = new Date(when);
      if (d.getFullYear() !== activeYear) continue;
      const movie = data.byId.get(id);
      months[d.getMonth()]++;
      if (movie?.runtime) minutes += movie.runtime;
      if (movie?.mainGenre) genre.set(movie.mainGenre, (genre.get(movie.mainGenre) ?? 0) + 1);
      const val = person ? e.ratings?.[person]?.value ?? null : e.rating ?? null;
      if (movie) films.push({ id, title: movie.title, value: val != null ? val.toFixed(1) : '–' });
    }
    const count = months.reduce((a, b) => a + b, 0);
    const bestMonthIdx = months.reduce((best, n, i) => (n > months[best] ? i : best), 0);
    const topGenre = [...genre.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '–';
    films.sort((a, b) => (Number(b.value) || -1) - (Number(a.value) || -1));
    return { count, hours: Math.round(minutes / 60), bestMonth: count ? MONTHS[bestMonthIdx] : '–', topGenre, films: films.slice(0, 8) };
  }, [userData, data.byId, person, activeYear]);

  if (!years.length) return null; // noch nichts mit Datum erfasst

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent/80">Jahresrückblick</h2>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${y === activeYear ? 'border-accent bg-accent/15 text-accent-soft' : 'border-ink-600 text-zinc-400 hover:text-zinc-200'}`}
          >
            {y}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[null, ...people].map((a) => {
          const active = person === a;
          const c = a ? authorColor(a) : undefined;
          return (
            <button
              key={a ?? 'alle'}
              onClick={() => setPerson(a)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${active ? (c ? 'bg-ink-800' : 'border-accent bg-accent/15 text-accent-soft') : 'border-ink-600 text-zinc-400 hover:text-zinc-200'}`}
              style={active && c ? { color: c, borderColor: c } : undefined}
            >
              {a ?? 'Alle'}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={String(r.count)} label={`Filme ${activeYear}`} />
        <Stat value={`${r.hours} h`} label="Laufzeit" />
        <Stat value={r.bestMonth} label="bester Monat" small />
        <Stat value={r.topGenre} label="Top-Genre" small />
      </div>
      <RankList title={`Gesehene Filme ${activeYear}`} rows={r.films} onPick={(id) => navigate(`/film/${id}`)} />
    </section>
  );
}

/** Übersicht aller aktuell verliehenen Filme (wer hat was) mit „zurück"-Aktion. */
function LentOverview() {
  const data = useData();
  const { data: userData, returnLent } = useUserData();
  const rows = useMemo(
    () =>
      Object.entries(userData)
        .filter(([, e]) => e.lentTo?.to)
        .map(([id, e]) => ({ id, to: e.lentTo!.to as string, at: e.lentTo!.at, movie: data.byId.get(id) }))
        .filter((r) => r.movie)
        .sort((a, b) => b.at - a.at),
    [userData, data.byId],
  );
  if (!rows.length) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent/80">Verliehen</h2>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg bg-ink-800/60 px-3 py-2 ring-1 ring-white/5">
            <Link to={`/film/${r.id}`} className="min-w-0 flex-1">
              <p className="truncate text-sm text-zinc-200">{r.movie!.title}</p>
              <p className="truncate text-xs text-zinc-500">
                an <span className="text-amber-300">{r.to}</span> · seit {new Date(r.at).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </Link>
            <button onClick={() => returnLent(r.id)} className="shrink-0 rounded-lg bg-ink-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-ink-600">
              zurück
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// Eine Kennzahl-Kachel in einem Dashboard.
interface Card {
  v: string;
  l: string;
  small?: boolean;
  color?: string;
  filter?: Partial<FilterState>; // Klick → Katalog mit diesem Filter
  to?: string; // Klick → direkt zu diesem Film
}

// 4K-Disc-Formate (für den „4K-Discs"-Filter).
const FOURK_FORMATS = ['4K UHD', '4K UHD + Blu-ray'];

export function StatsPage() {
  const data = useData();
  const navigate = useNavigate();
  const { showFilter } = useCatalog();
  const M = data.movies;
  // Gewähltes Dashboard merken, damit es nach „Zurück" aus dem Katalog erhalten bleibt.
  const [dash, setDash] = useState(() => {
    try {
      return localStorage.getItem('filmkatalog.stats.dash') || 'umfang';
    } catch {
      return 'umfang';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('filmkatalog.stats.dash', dash);
    } catch {
      /* localStorage nicht verfügbar → nur pro Sitzung */
    }
  }, [dash]);

  const stats = useMemo(() => {
    const totalMin = M.reduce((s, m) => s + (m.runtime ?? 0), 0);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.round((totalMin % 1440) / 60);
    const n = M.length || 1;
    const pct = (c: number) => `${Math.round((c / n) * 100)}%`;
    const runtimes = M.map((m) => m.runtime).filter((r): r is number => r != null);
    const avgRuntime = runtimes.length ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length) : 0;
    const withYear = M.filter((m) => m.year != null);
    const years = withYear.map((m) => m.year as number);
    const oldestM = withYear.length ? withYear.reduce((a, b) => ((a.year as number) <= (b.year as number) ? a : b)) : null;
    const newestM = withYear.length ? withYear.reduce((a, b) => ((a.year as number) >= (b.year as number) ? a : b)) : null;
    const byDecadeCount = tally(M, (m) => m.decade);
    const byGenreFull = tally(M, (m) => m.mainGenre);
    const series = M.filter((m) => m.type === 'Serie').length;

    return {
      byFormat: tally(M, (m) => m.discFormat),
      byGenre: byGenreFull.slice(0, 14),
      byDecade: [...byDecadeCount].sort((a, b) => a[0].localeCompare(b[0])),
      byFsk: tally(M, (m) => (m.fsk == null ? 'unbekannt' : `FSK ${m.fsk}`)),
      count: M.length,
      series,
      films: M.length - series,
      uhd: M.filter((m) => m.is4kDisc).length,
      bluray: M.filter((m) => m.discFormat === 'Blu-ray').length,
      dvd: M.filter((m) => m.discFormat === 'DVD').length,
      totalLabel: `${days} T ${hours} h`,
      avgRuntime,
      native4k: M.filter((m) => m.native4k === 'Ja').length,
      hdr: M.filter((m) => m.hasHdr).length,
      dv: M.filter((m) => m.hasDolbyVision).length,
      atmos: M.filter((m) => m.atmos === 'Ja').length,
      extendedCut: M.filter((m) => m.extendedCut).length,
      oldest: years.length ? Math.min(...years) : null,
      newest: years.length ? Math.max(...years) : null,
      oldestId: oldestM?.groupId && data.groups.get(oldestM.groupId)?.[0]?.id ? data.groups.get(oldestM.groupId)![0].id : oldestM?.id ?? null,
      newestId: newestM?.groupId && data.groups.get(newestM.groupId)?.[0]?.id ? data.groups.get(newestM.groupId)![0].id : newestM?.id ?? null,
      topDecade: byDecadeCount[0]?.[0] ?? '–',
      topGenre: byGenreFull[0]?.[0] ?? '–',
      directors: data.directors.length,
      franchises: data.franchises.length,
      pct,
    };
  }, [M, data.groups, data.directors.length, data.franchises.length]);

  // Thematische Dashboards (umschaltbar) für die Kennzahl-Kacheln oben.
  const dashboards: { key: string; label: string; cards: Card[] }[] = [
    {
      key: 'umfang',
      label: 'Umfang',
      cards: [
        { v: String(stats.count), l: 'Titel gesamt', filter: {} },
        { v: String(stats.films), l: 'Filme', filter: { type: ['Film'] } },
        { v: String(stats.series), l: 'Serien', filter: { type: ['Serie'] } },
        { v: String(stats.uhd), l: '4K-Discs', filter: { discFormat: FOURK_FORMATS } },
        { v: String(stats.bluray), l: 'Blu-ray (ohne 4K)', filter: { discFormat: ['Blu-ray'] } },
        { v: String(stats.dvd), l: 'DVDs', filter: { discFormat: ['DVD'] } },
        { v: stats.totalLabel, l: 'Gesamtlaufzeit' },
        { v: `${stats.avgRuntime} Min`, l: 'Ø Laufzeit' },
      ],
    },
    {
      key: 'av',
      label: 'Bild & Ton',
      cards: [
        { v: stats.pct(stats.native4k), l: 'natives 4K', filter: { native4kOnly: true } },
        { v: stats.pct(stats.hdr), l: 'HDR', filter: { hdr: 'has' } },
        { v: stats.pct(stats.dv), l: 'Dolby Vision', filter: { hdr: 'dv' } },
        { v: stats.pct(stats.atmos), l: 'Dolby Atmos', filter: { atmosOnly: true } },
        { v: String(stats.extendedCut), l: 'Extended Cuts', filter: { extendedCutOnly: true } },
        { v: String(stats.uhd), l: '4K-UHD-Discs', filter: { discFormat: FOURK_FORMATS } },
      ],
    },
    {
      key: 'entdecken',
      label: 'Entdecken',
      cards: [
        { v: stats.oldest ? String(stats.oldest) : '–', l: 'ältester Film', small: false, to: stats.oldestId ?? undefined },
        { v: stats.newest ? String(stats.newest) : '–', l: 'neuester Film', to: stats.newestId ?? undefined },
        { v: stats.topDecade, l: 'häufigstes Jahrzehnt', small: true, filter: stats.topDecade !== '–' ? { decade: [stats.topDecade] } : undefined },
        { v: stats.topGenre, l: 'häufigstes Genre', small: true, filter: stats.topGenre !== '–' ? { mainGenre: [stats.topGenre] } : undefined },
        { v: String(stats.directors), l: 'Regie (Personen)' },
        { v: String(stats.franchises), l: 'Reihen' },
      ],
    },
  ];
  const active = dashboards.find((d) => d.key === dash) ?? dashboards[0];

  // Klick auf eine Kachel: entweder zum Film oder gefiltert in den Katalog.
  const cardAction = (c: Card): (() => void) | undefined => {
    if (c.to) return () => navigate(`/film/${c.to}`);
    if (c.filter) return () => { showFilter(c.filter!); navigate('/'); };
    return undefined;
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 bg-ink-900/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
            className="inline-flex items-center gap-1 rounded-full bg-ink-800 py-1.5 pl-2 pr-3 text-sm hover:bg-ink-700"
          >
            <IconChevronLeft width={18} height={18} /> Zurück
          </button>
          <h1 className="text-lg font-bold">Statistik</h1>
        </div>
        <SectionNav current="stats" />
      </header>

      {/* Dashboard-Umschalter */}
      <div className="mt-4 flex gap-1 rounded-xl bg-ink-800 p-1">
        {dashboards.map((d) => (
          <button
            key={d.key}
            onClick={() => setDash(d.key)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
              d.key === dash ? 'bg-accent text-ink-950' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        {active.cards.map((c) => (
          <Stat key={c.l} value={c.v} label={c.l} color={c.color} small={c.small} onClick={cardAction(c)} />
        ))}
      </div>

      <PersonalStats />

      <JahresRueckblick />

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-600">Sammlung</h2>
      <BarList title="Nach Discformat" rows={stats.byFormat} />
      <BarList title="Nach Hauptgenre (Top 14)" rows={stats.byGenre} />
      <BarList title="Nach Jahrzehnt" rows={stats.byDecade} />
      <BarList title="Nach FSK" rows={stats.byFsk} />

      <LentOverview />

      <DataQuality />

      <MyDataSection />
    </div>
  );
}
