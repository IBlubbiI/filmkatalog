import { useEffect, useMemo, useState } from 'react';
import type { Movie } from '../types';
import {
  DISC_FORMATS,
  emptyFilters,
  facetCounts,
  matches,
  type FilterState,
  type FskValue,
  type SeenValue,
} from '../lib/filters';
import { useData } from '../lib/data';
import { IconClose, IconCheck } from './Icons';

interface Props {
  open: boolean;
  onClose: () => void;
  movies: Movie[];
  state: FilterState;
  setState: React.Dispatch<React.SetStateAction<FilterState>>;
}

function Section({ title, children, hint }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink-700/70 py-4 first:border-t-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>
        {hint && (typeof hint === 'string' ? <span className="text-xs text-zinc-500">{hint}</span> : hint)}
      </div>
      {children}
    </section>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
  disabled,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`chip border ${
        active
          ? 'border-accent bg-accent/15 text-accent-soft'
          : disabled
            ? 'cursor-not-allowed border-ink-700 bg-transparent text-zinc-600'
            : 'border-ink-700 bg-ink-800 text-zinc-300 hover:border-ink-600'
      }`}
    >
      {active && <IconCheck width={13} height={13} />}
      {label}
      {count != null && <span className={active ? 'text-accent/70' : 'text-zinc-500'}>({count})</span>}
    </button>
  );
}

export function FilterSheet({ open, onClose, movies, state, setState }: Props) {
  const data = useData();
  const [dirQuery, setDirQuery] = useState('');
  const [franQuery, setFranQuery] = useState('');
  const [labelQuery, setLabelQuery] = useState('');

  // Body-Scroll sperren, wenn offen
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const toggleArr = <T,>(key: keyof FilterState, value: T) =>
    setState((s) => {
      const arr = s[key] as unknown as T[];
      const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
      return { ...s, [key]: next };
    });

  const setSingle = (key: keyof FilterState, value: unknown) =>
    setState((s) => ({ ...s, [key]: s[key] === value ? null : value }));

  // --- Facetten ---
  const total = useMemo(() => movies.filter((m) => matches(m, state)).length, [movies, state]);
  const typeC = useMemo(() => facetCounts(movies, state, 'type', (m) => m.type), [movies, state]);
  const discC = useMemo(() => facetCounts(movies, state, 'discFormat', (m) => m.discFormat), [movies, state]);
  const genreC = useMemo(() => facetCounts(movies, state, 'mainGenre', (m) => m.genresAll), [movies, state]);
  const fskC = useMemo(
    () => facetCounts<FskValue>(movies, state, 'fsk', (m) => (m.fsk == null ? 'unbekannt' : m.fsk)),
    [movies, state],
  );
  const decadeC = useMemo(() => facetCounts(movies, state, 'decade', (m) => m.decade), [movies, state]);
  const catC = useMemo(() => facetCounts(movies, state, 'category', (m) => m.category), [movies, state]);
  const arC = useMemo(() => facetCounts(movies, state, 'aspectRatio', (m) => m.aspectRatio ?? 'unbekannt'), [movies, state]);
  const seenC = useMemo(
    () =>
      facetCounts<SeenValue>(movies, state, 'seen', (m) =>
        m.seen === true ? 'ja' : m.seen === false ? 'nein' : 'unbekannt',
      ),
    [movies, state],
  );
  const dirC = useMemo(() => facetCounts(movies, state, 'director', (m) => m.directors), [movies, state]);
  const franC = useMemo(() => facetCounts(movies, state, 'franchise', (m) => m.franchise), [movies, state]);
  const labelC = useMemo(() => facetCounts(movies, state, 'label', (m) => m.labelMain), [movies, state]);

  // Zähler für Bool-Toggles (matcht alles außer der jeweiligen Dimension)
  const countExcept = (dim: string, pred: (m: Movie) => boolean) =>
    movies.filter((m) => matches(m, state, dim) && pred(m)).length;
  const n4k = countExcept('native4k', (m) => m.native4k === 'Ja');
  const nHdr = countExcept('hdr', (m) => m.hasHdr);
  const nDv = countExcept('hdr', (m) => m.hasDolbyVision);
  const nAtmos = countExcept('atmos', (m) => m.atmos === 'Ja');
  const nEc = countExcept('extendedCut', (m) => m.extendedCut);

  const fskOptions: FskValue[] = [0, 6, 12, 16, 18, 'unbekannt'];
  const runtimeMinMax = useMemo(() => {
    const rts = movies.map((m) => m.runtime).filter((r): r is number => r != null);
    return { min: Math.min(...rts), max: Math.max(...rts) };
  }, [movies]);

  const dirList = useMemo(() => {
    const q = dirQuery.trim().toLowerCase();
    const arr = data.directors.filter((d) => (q ? d.name.toLowerCase().includes(q) : true));
    return q ? arr.slice(0, 40) : arr.filter((d) => d.count > 1).slice(0, 24);
  }, [data.directors, dirQuery]);
  const franList = useMemo(() => {
    const q = franQuery.trim().toLowerCase();
    const arr = data.franchises.filter((f) => (q ? f.name.toLowerCase().includes(q) : true));
    return q ? arr.slice(0, 40) : arr.slice(0, 24);
  }, [data.franchises, franQuery]);
  const labelList = useMemo(() => {
    const q = labelQuery.trim().toLowerCase();
    const arr = data.labels.filter((l) => (q ? l.name.toLowerCase().includes(q) : true));
    return q ? arr.slice(0, 40) : arr.slice(0, 20);
  }, [data.labels, labelQuery]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Filter">
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] animate-slide-up flex-col rounded-t-2xl bg-ink-850 shadow-2xl ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <div className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-ink-600" />
          <h2 className="text-base font-semibold">Filter</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-zinc-400 hover:bg-ink-700" aria-label="Schließen">
            <IconClose />
          </button>
        </div>

        {/* Scrollbereich */}
        <div className="no-scrollbar overflow-y-auto px-4 pb-2">
          <Section title="Typ">
            <div className="flex flex-wrap gap-2">
              {(['Film', 'Serie'] as const).map((t) => (
                <Chip key={t} label={t} count={typeC.get(t) ?? 0} active={state.type.includes(t)} onClick={() => toggleArr('type', t)} />
              ))}
            </div>
          </Section>

          <Section title="Discformat" hint="Mehrfachauswahl">
            <div className="flex flex-wrap gap-2">
              {DISC_FORMATS.map((f) => (
                <Chip
                  key={f}
                  label={f}
                  count={discC.get(f) ?? 0}
                  active={state.discFormat.includes(f)}
                  onClick={() => toggleArr('discFormat', f)}
                />
              ))}
            </div>
          </Section>

          <Section title="Bild & Ton">
            <div className="flex flex-wrap gap-2">
              <Chip label="Natives 4K" count={n4k} active={state.native4kOnly} onClick={() => setState((s) => ({ ...s, native4kOnly: !s.native4kOnly }))} />
              <Chip label="HDR" count={nHdr} active={state.hdr === 'has'} onClick={() => setState((s) => ({ ...s, hdr: s.hdr === 'has' ? 'any' : 'has' }))} />
              <Chip label="Dolby Vision" count={nDv} active={state.hdr === 'dv'} onClick={() => setState((s) => ({ ...s, hdr: s.hdr === 'dv' ? 'any' : 'dv' }))} />
              <Chip label="Dolby Atmos" count={nAtmos} active={state.atmosOnly} onClick={() => setState((s) => ({ ...s, atmosOnly: !s.atmosOnly }))} />
              <Chip label="Extended Cut" count={nEc} active={state.extendedCutOnly} onClick={() => setState((s) => ({ ...s, extendedCutOnly: !s.extendedCutOnly }))} />
            </div>
          </Section>

          <Section
            title="Genre"
            hint={
              <span className="inline-flex overflow-hidden rounded-md border border-ink-700 text-[11px]">
                <button
                  onClick={() => setState((s) => ({ ...s, genreMode: 'or' }))}
                  className={`px-2 py-0.5 ${state.genreMode === 'or' ? 'bg-accent/20 text-accent-soft' : 'text-zinc-400'}`}
                >
                  beliebiges
                </button>
                <button
                  onClick={() => setState((s) => ({ ...s, genreMode: 'and' }))}
                  className={`px-2 py-0.5 ${state.genreMode === 'and' ? 'bg-accent/20 text-accent-soft' : 'text-zinc-400'}`}
                >
                  alle (UND)
                </button>
              </span>
            }
          >
            <div className="flex flex-wrap gap-2">
              {[...data.mainGenres]
                .map((g) => [g, genreC.get(g) ?? 0] as const)
                .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
                .map(([g, c]) => (
                  <Chip key={g} label={g} count={c} active={state.mainGenre.includes(g)} onClick={() => toggleArr('mainGenre', g)} />
                ))}
            </div>
            <input
              value={state.genreText}
              onChange={(e) => setState((s) => ({ ...s, genreText: e.target.value }))}
              placeholder={'Volltext über alle Genres, z. B. „Comic“ …'}
              className="mt-3 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-accent/60"
            />
          </Section>

          {data.categories.length > 0 && (
            <Section title="Kategorie" hint="Comic-Universum">
              <div className="flex flex-wrap gap-2">
                {data.categories.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    count={catC.get(c) ?? 0}
                    active={state.category.includes(c)}
                    onClick={() => toggleArr('category', c)}
                  />
                ))}
              </div>
            </Section>
          )}

          <Section title="FSK" hint="Mehrfachauswahl">
            <div className="flex flex-wrap gap-2">
              {fskOptions.map((f) => (
                <Chip
                  key={String(f)}
                  label={f === 'unbekannt' ? 'unbekannt' : `FSK ${f}`}
                  count={fskC.get(f) ?? 0}
                  active={state.fsk.includes(f)}
                  onClick={() => toggleArr('fsk', f)}
                />
              ))}
            </div>
          </Section>

          <Section title="Bildformat" hint="wenig Balken auf 16:9 → 1.78:1 / 1.85:1">
            <div className="flex flex-wrap gap-2">
              {data.aspectRatios.map((a) => (
                <Chip key={a} label={a} count={arC.get(a) ?? 0} active={state.aspectRatio.includes(a)} onClick={() => toggleArr('aspectRatio', a)} />
              ))}
              {(arC.get('unbekannt') ?? 0) > 0 && (
                <Chip label="unbekannt" count={arC.get('unbekannt') ?? 0} active={state.aspectRatio.includes('unbekannt')} onClick={() => toggleArr('aspectRatio', 'unbekannt')} />
              )}
            </div>
          </Section>

          <Section title="Jahrzehnt" hint="Mehrfachauswahl">
            <div className="flex flex-wrap gap-2">
              {data.decades.map((d) => (
                <Chip key={d} label={d} count={decadeC.get(d) ?? 0} active={state.decade.includes(d)} onClick={() => toggleArr('decade', d)} />
              ))}
            </div>
          </Section>

          <Section title="Laufzeit" hint={state.runtimeMax != null ? `bis ${state.runtimeMax} Min.` : 'egal'}>
            <input
              type="range"
              min={runtimeMinMax.min}
              max={runtimeMinMax.max}
              step={5}
              value={state.runtimeMax ?? runtimeMinMax.max}
              onChange={(e) => {
                const v = Number(e.target.value);
                setState((s) => ({ ...s, runtimeMax: v >= runtimeMinMax.max ? null : v }));
              }}
              className="w-full accent-accent"
            />
            <div className="mt-1 flex justify-between text-xs text-zinc-500">
              <span>{runtimeMinMax.min} Min.</span>
              <div className="flex gap-2">
                {[90, 100, 120].map((v) => (
                  <button key={v} onClick={() => setState((s) => ({ ...s, runtimeMax: v }))} className="text-accent-soft hover:underline">
                    ≤ {v}
                  </button>
                ))}
                {state.runtimeMax != null && (
                  <button onClick={() => setState((s) => ({ ...s, runtimeMax: null }))} className="text-zinc-400 hover:underline">
                    Reset
                  </button>
                )}
              </div>
              <span>{runtimeMinMax.max} Min.</span>
            </div>
          </Section>

          <Section title="Regie" hint={state.director ?? undefined}>
            <input
              value={dirQuery}
              onChange={(e) => setDirQuery(e.target.value)}
              placeholder={'Regisseur suchen, z. B. „Tarantino“ …'}
              className="mb-2 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-accent/60"
            />
            <div className="flex flex-wrap gap-2">
              {dirList.map((d) => (
                <Chip
                  key={d.name}
                  label={d.name}
                  count={dirC.get(d.name) ?? 0}
                  active={state.director === d.name}
                  onClick={() => setSingle('director', d.name)}
                />
              ))}
            </div>
          </Section>

          <Section title="Reihe / Franchise" hint={state.franchise ?? undefined}>
            <input
              value={franQuery}
              onChange={(e) => setFranQuery(e.target.value)}
              placeholder={'Reihe suchen, z. B. „James Bond“ …'}
              className="mb-2 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-accent/60"
            />
            <div className="flex flex-wrap gap-2">
              {franList.map((f) => (
                <Chip
                  key={f.name}
                  label={f.name}
                  count={franC.get(f.name) ?? 0}
                  active={state.franchise === f.name}
                  onClick={() => setSingle('franchise', f.name)}
                />
              ))}
            </div>
          </Section>

          <Section title="Label" hint={state.label.length ? `${state.label.length} gewählt` : 'Studio / Vertrieb'}>
            <input
              value={labelQuery}
              onChange={(e) => setLabelQuery(e.target.value)}
              placeholder={'Label suchen, z. B. „Paramount“ …'}
              className="mb-2 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-accent/60"
            />
            <div className="flex flex-wrap gap-2">
              {labelList.map((l) => (
                <Chip
                  key={l.name}
                  label={l.name}
                  count={labelC.get(l.name) ?? 0}
                  active={state.label.includes(l.name)}
                  onClick={() => toggleArr('label', l.name)}
                />
              ))}
            </div>
          </Section>

          <Section title="Gesehen">
            <div className="flex flex-wrap gap-2">
              {(['ja', 'nein', 'unbekannt'] as SeenValue[]).map((v) => (
                <Chip key={v} label={v} count={seenC.get(v) ?? 0} active={state.seen.includes(v)} onClick={() => toggleArr('seen', v)} />
              ))}
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-ink-700 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button onClick={() => setState(emptyFilters())} className="rounded-lg px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-ink-700">
            Zurücksetzen
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg bg-accent py-3 text-sm font-bold text-ink-950 transition-colors hover:bg-accent-soft">
            {total} {total === 1 ? 'Treffer' : 'Treffer'} anzeigen
          </button>
        </div>
      </div>
    </div>
  );
}
