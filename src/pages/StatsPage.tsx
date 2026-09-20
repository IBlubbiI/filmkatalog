import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { useUserData } from '../lib/userData';
import { useDriveSync } from '../lib/driveSync';
import { IconChevronLeft } from '../components/Icons';
import type { Movie } from '../types';

function DriveSync() {
  const s = useDriveSync();
  const time = s.lastSync ? new Date(s.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div className="mt-4 border-t border-ink-700/70 pt-4">
      <h3 className="mb-1 text-sm font-semibold text-zinc-200">Geräte-Sync über Google Drive</h3>
      {!s.enabled ? (
        <p className="text-xs text-zinc-500">Wird gerade eingerichtet – danach kannst du Tablet & Handy hier verbinden.</p>
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
            Verbinde dein Google-Konto, damit deine Bewertungen automatisch zwischen deinen Geräten abgeglichen werden.
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
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-accent/80">Meine Bewertungen</h2>
      <p className="mb-3 text-xs text-zinc-500">
        {count === 0
          ? 'Noch keine – bewerte Filme auf ihrer Detailseite.'
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
        Hinweis: Diese Bewertungen liegen auf diesem Gerät (nicht in der Excel). Mit „Sichern" legst du eine Datei zum
        Aufbewahren an – oder du verbindest unten Google Drive für den automatischen Abgleich zwischen deinen Geräten.
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-ink-800 p-4 text-center">
      <p className="text-2xl font-bold text-accent-soft">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

export function StatsPage() {
  const data = useData();
  const M = data.movies;

  const stats = useMemo(() => {
    const totalMin = M.reduce((s, m) => s + (m.runtime ?? 0), 0);
    const days = Math.floor(totalMin / 1440);
    const hours = Math.round((totalMin % 1440) / 60);
    const native4k = M.filter((m) => m.native4k === 'Ja').length;
    const uhd = M.filter((m) => m.is4kDisc).length;
    return {
      byFormat: tally(M, (m) => m.discFormat),
      byGenre: tally(M, (m) => m.mainGenre).slice(0, 14),
      byDecade: tally(M, (m) => m.decade).sort((a, b) => a[0].localeCompare(b[0])),
      byFsk: tally(M, (m) => (m.fsk == null ? 'unbekannt' : `FSK ${m.fsk}`)),
      byType: tally(M, (m) => m.type),
      native4k,
      uhd,
      totalLabel: `${days} T ${hours} h`,
      count: M.length,
    };
  }, [M]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-2 bg-ink-900/90 px-4 py-3 backdrop-blur-md">
        <Link to="/" className="inline-flex items-center gap-1 rounded-full bg-ink-800 py-1.5 pl-2 pr-3 text-sm hover:bg-ink-700">
          <IconChevronLeft width={18} height={18} /> Zurück
        </Link>
        <h1 className="text-lg font-bold">Statistik</h1>
      </header>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Stat value={String(stats.count)} label="Titel gesamt" />
        <Stat value={stats.totalLabel} label="Gesamtlaufzeit" />
        <Stat value={`${Math.round((stats.native4k / stats.count) * 100)}%`} label="natives 4K" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat value={String(stats.uhd)} label="4K-UHD-Discs" />
        <Stat value={String(stats.byType.find((t) => t[0] === 'Serie')?.[1] ?? 0)} label="Serien" />
      </div>

      <BarList title="Nach Discformat" rows={stats.byFormat} />
      <BarList title="Nach Hauptgenre (Top 14)" rows={stats.byGenre} />
      <BarList title="Nach Jahrzehnt" rows={stats.byDecade} />
      <BarList title="Nach FSK" rows={stats.byFsk} />

      <MyDataSection />
    </div>
  );
}
