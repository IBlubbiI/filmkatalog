import { emptyFilters, activeCount, type FilterState } from '../lib/filters';
import { IconClose } from './Icons';

interface Props {
  state: FilterState;
  setState: React.Dispatch<React.SetStateAction<FilterState>>;
}

interface Descriptor {
  label: string;
  clear: (s: FilterState) => FilterState;
}

function build(state: FilterState): Descriptor[] {
  const d: Descriptor[] = [];
  const rmFrom = <T,>(key: keyof FilterState, v: T) => (s: FilterState) => ({
    ...s,
    [key]: (s[key] as unknown as T[]).filter((x) => x !== v),
  });

  state.type.forEach((t) => d.push({ label: t, clear: rmFrom('type', t) }));
  state.discFormat.forEach((f) => d.push({ label: f, clear: rmFrom('discFormat', f) }));
  if (state.native4kOnly) d.push({ label: 'Natives 4K', clear: (s) => ({ ...s, native4kOnly: false }) });
  if (state.hdr === 'has') d.push({ label: 'HDR', clear: (s) => ({ ...s, hdr: 'any' }) });
  if (state.hdr === 'dv') d.push({ label: 'Dolby Vision', clear: (s) => ({ ...s, hdr: 'any' }) });
  if (state.atmosOnly) d.push({ label: 'Atmos', clear: (s) => ({ ...s, atmosOnly: false }) });
  if (state.extendedCutOnly) d.push({ label: 'Extended Cut', clear: (s) => ({ ...s, extendedCutOnly: false }) });
  state.category.forEach((c) => d.push({ label: c, clear: rmFrom('category', c) }));
  state.mainGenre.forEach((g) => d.push({ label: g, clear: rmFrom('mainGenre', g) }));
  if (state.genreText.trim()) d.push({ label: `Genre: „${state.genreText}"`, clear: (s) => ({ ...s, genreText: '' }) });
  state.fsk.forEach((f) => d.push({ label: f === 'unbekannt' ? 'FSK ?' : `FSK ${f}`, clear: rmFrom('fsk', f) }));
  state.aspectRatio.forEach((a) => d.push({ label: a, clear: rmFrom('aspectRatio', a) }));
  state.decade.forEach((dc) => d.push({ label: dc, clear: rmFrom('decade', dc) }));
  if (state.runtimeMax != null) d.push({ label: `≤ ${state.runtimeMax} Min.`, clear: (s) => ({ ...s, runtimeMax: null }) });
  if (state.director) d.push({ label: `Regie: ${state.director}`, clear: (s) => ({ ...s, director: null }) });
  if (state.franchise) d.push({ label: state.franchise, clear: (s) => ({ ...s, franchise: null }) });
  state.label.forEach((l) => d.push({ label: l, clear: rmFrom('label', l) }));
  state.seen.forEach((v) => d.push({ label: `Gesehen: ${v}`, clear: rmFrom('seen', v) }));
  return d;
}

export function ActiveChips({ state, setState }: Props) {
  const chips = build(state);
  if (chips.length === 0) return null;
  return (
    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
      {chips.map((c, i) => (
        <button
          key={i}
          onClick={() => setState(c.clear)}
          className="chip shrink-0 border border-accent/40 bg-accent/10 text-accent-soft"
        >
          {c.label}
          <IconClose width={13} height={13} />
        </button>
      ))}
      {activeCount(state) > 1 && (
        <button
          onClick={() => setState(emptyFilters())}
          className="chip shrink-0 whitespace-nowrap text-zinc-400 underline-offset-2 hover:underline"
        >
          Alle zurücksetzen
        </button>
      )}
    </div>
  );
}
