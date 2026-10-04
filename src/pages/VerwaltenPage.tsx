import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { admin, checkPassword, fetchRow, type MovieRow, type TmdbHit } from '../lib/admin';
import { IconChevronLeft, IconSearch, IconClose } from '../components/Icons';

type Field = { k: string; l: string; t: 'text' | 'number' | 'select'; o?: string[] };
const GROUPS: { group: string; items: Field[] }[] = [
  {
    group: 'Basis',
    items: [
      { k: 'title_de', l: 'Titel (DE)', t: 'text' },
      { k: 'title_original', l: 'Originaltitel', t: 'text' },
      { k: 'year', l: 'Jahr', t: 'number' },
      { k: 'director', l: 'Regie', t: 'text' },
      { k: 'franchise', l: 'Reihe/Franchise', t: 'text' },
      { k: 'category', l: 'Kategorie', t: 'select', o: ['', 'Marvel', 'DC'] },
      { k: 'genre', l: 'Genre (kommagetrennt)', t: 'text' },
      { k: 'main_genre', l: 'Hauptgenre', t: 'text' },
      { k: 'type', l: 'Typ', t: 'select', o: ['Film', 'Serie'] },
    ],
  },
  {
    group: 'Disc & Bild',
    items: [
      { k: 'disc_format', l: 'Discformat(e)', t: 'text' },
      { k: 'discs', l: 'Discs', t: 'number' },
      { k: 'native_4k', l: 'Natives 4K', t: 'select', o: ['', 'Ja', 'Nein'] },
      { k: 'hdr', l: 'HDR / Dolby Vision', t: 'text' },
      { k: 'atmos', l: 'Atmos', t: 'select', o: ['', 'Ja', 'Nein'] },
      { k: 'aspect_ratio', l: 'Bildformat (z. B. 2.39:1)', t: 'text' },
      { k: 'fsk', l: 'FSK', t: 'text' },
      { k: 'runtime_min', l: 'Laufzeit (Min.)', t: 'number' },
      { k: 'edition', l: 'Edition/Verpackung', t: 'text' },
      { k: 'box', l: 'Box/Sammlung', t: 'text' },
      { k: 'label', l: 'Label', t: 'text' },
      { k: 'ean', l: 'EAN', t: 'text' },
    ],
  },
  {
    group: 'Ton & Extended Cut',
    items: [
      { k: 'audio_ov', l: 'Beste OV-Tonspur', t: 'text' },
      { k: 'audio_de', l: 'Beste DE-Tonspur', t: 'text' },
      { k: 'extended_cut', l: 'Extended Cut?', t: 'select', o: ['', 'Ja', 'Nein'] },
      { k: 'ec_extra_runtime', l: 'EC Mehrlaufzeit', t: 'text' },
      { k: 'ec_on_disc', l: 'EC auf Disc', t: 'text' },
      { k: 'ec_audio', l: 'EC Tonspur', t: 'text' },
      { k: 'subtitles_de', l: 'DE-Untertitel', t: 'text' },
    ],
  },
  {
    group: 'Sonstiges',
    items: [
      { k: 'bonus', l: 'Bonusmaterial', t: 'text' },
      { k: 'digital_copy', l: 'Digitale Kopie', t: 'select', o: ['', 'Ja', 'Nein'] },
      { k: 'location', l: 'Standort', t: 'text' },
      { k: 'other_copies', l: 'Weitere Exemplare (IDs)', t: 'text' },
      { k: 'seen', l: 'Gesehen', t: 'text' },
      { k: 'rating', l: 'Bewertung (1–10)', t: 'number' },
    ],
  },
];

const PW_KEY = 'filmkatalog.admin.pw';
const IMG = (p: string | null) => (p ? `https://image.tmdb.org/t/p/w154${p}` : null);

export function VerwaltenPage() {
  const data = useData();
  const [pw, setPw] = useState<string>(() => sessionStorage.getItem(PW_KEY) || '');
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; s: string } | null>(null);

  const [tab, setTab] = useState<'add' | 'edit'>('add');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<TmdbHit[]>([]);
  const [form, setForm] = useState<MovieRow | null>(null);
  const [editQuery, setEditQuery] = useState('');

  // WICHTIG: alle Hooks (auch dieses useMemo) VOR dem vorzeitigen Passwort-Return,
  // sonst ändert sich die Hook-Anzahl beim Entsperren → React-Fehler / leere Ansicht.
  const editList = useMemo(() => {
    const q = editQuery.trim().toLowerCase();
    const prim = [...data.groups.values()].map((g) => g[0]);
    return prim
      .filter((m) => !q || m.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title, 'de'))
      .slice(0, q ? 60 : 0);
  }, [data.groups, editQuery]);

  const say = (t: 'ok' | 'err', s: string) => {
    setMsg({ t, s });
    setTimeout(() => setMsg((m) => (m?.s === s ? null : m)), 5000);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      say('err', String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  // ---- Login ----------------------------------------------------------------
  const unlock = () =>
    run(async () => {
      await checkPassword(pwInput);
      sessionStorage.setItem(PW_KEY, pwInput);
      setPw(pwInput);
      setUnlocked(true);
    });

  if (!unlocked && !pw) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <h1 className="mb-1 text-lg font-bold">Verwalten</h1>
        <p className="mb-5 text-sm text-zinc-500">Passwort eingeben, um Filme hinzuzufügen oder zu bearbeiten.</p>
        <input
          type="password"
          value={pwInput}
          onChange={(e) => setPwInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && unlock()}
          placeholder="Admin-Passwort"
          className="w-full rounded-xl border border-ink-700 bg-ink-800 px-4 py-2.5 text-sm focus:border-accent/60"
        />
        {msg?.t === 'err' && <p className="mt-2 text-xs text-red-400">{msg.s}</p>}
        <button onClick={unlock} disabled={busy || !pwInput} className="mt-4 w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-ink-950 disabled:opacity-50">
          {busy ? '…' : 'Entsperren'}
        </button>
        <Link to="/" className="mt-4 inline-block text-xs text-zinc-500 hover:text-zinc-300">
          ← Zurück zum Katalog
        </Link>
      </div>
    );
  }
  const PW = pw || pwInput;

  // ---- Formular ----------------------------------------------------------------
  const set = (k: string, v: string) => setForm((f) => ({ ...(f || {}), [k]: v }));

  const startFromHit = (h: TmdbHit) =>
    run(async () => {
      const [d, id] = await Promise.all([admin.detail(h.tmdbId, h.type, PW), admin.nextId(PW)]);
      setForm({
        id,
        tmdb_override: h.tmdbId,
        title_de: d.title || h.title,
        title_original: d.original_title || h.originalTitle || '',
        year: d.year || h.year || '',
        director: d.director || '',
        genre: d.genres.join(', '),
        main_genre: d.genres[0] || '',
        runtime_min: d.runtime || '',
        type: h.type === 'tv' ? 'Serie' : 'Film',
      });
      setHits([]);
      setQuery('');
    });

  const editExisting = (id: string) =>
    run(async () => {
      const row = await fetchRow(id);
      if (!row) throw new Error('Datensatz nicht gefunden');
      setForm(row);
      setTab('add'); // gleiches Formular
      window.scrollTo(0, 0);
    });

  const save = () =>
    run(async () => {
      if (!form?.title_de) throw new Error('Titel (DE) fehlt');
      const saved = await admin.upsert(form, PW);
      say('ok', `„${saved.title_de}" gespeichert (${saved.id}). Zum Live-Schalten „Veröffentlichen".`);
      setForm(null);
    });

  const del = (id: string, title: string) =>
    run(async () => {
      if (!confirm(`„${title}" (${id}) wirklich entfernen?`)) return;
      await admin.remove(id, PW);
      say('ok', `„${title}" entfernt. Zum Live-Schalten „Veröffentlichen".`);
    });

  const publish = () =>
    run(async () => {
      await admin.publish(PW);
      say('ok', 'Build gestartet – in ca. 2–3 Minuten live.');
    });

  const search = () =>
    run(async () => {
      if (query.trim().length < 2) return;
      setHits(await admin.search(query.trim(), PW));
    });

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 bg-ink-900/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Link to="/" className="inline-flex items-center gap-1 rounded-full bg-ink-800 py-1.5 pl-2 pr-3 text-sm hover:bg-ink-700">
            <IconChevronLeft width={18} height={18} /> Katalog
          </Link>
          <h1 className="text-lg font-bold">Verwalten</h1>
        </div>
        <button onClick={publish} disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-ink-950 hover:bg-accent-soft disabled:opacity-50">
          Veröffentlichen
        </button>
      </header>

      {msg && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.t === 'ok' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{msg.s}</div>
      )}

      {!form && (
        <div className="mt-3 flex rounded-lg border border-ink-700 bg-ink-800 p-0.5 text-sm">
          {(['add', 'edit'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === t ? 'bg-ink-700 text-accent-soft' : 'text-zinc-400'}`}>
              {t === 'add' ? '+ Neuer Film' : 'Bearbeiten / Entfernen'}
            </button>
          ))}
        </div>
      )}

      {/* ----- Neuer Film: TMDB-Suche ----- */}
      {!form && tab === 'add' && (
        <div className="mt-4">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Film/Serie bei TMDB suchen…"
              className="w-full rounded-xl border border-ink-700 bg-ink-800 py-2.5 pl-10 pr-24 text-sm focus:border-accent/60"
            />
            <button onClick={search} disabled={busy} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-ink-700 px-3 py-1.5 text-xs font-medium hover:bg-ink-600 disabled:opacity-50">
              Suchen
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {hits.map((h) => (
              <button key={h.tmdbId} onClick={() => startFromHit(h)} disabled={busy} className="flex w-full items-center gap-3 rounded-lg border border-ink-700 bg-ink-800 p-2 text-left hover:border-accent/40">
                {IMG(h.poster) ? <img src={IMG(h.poster)!} alt="" className="h-16 w-11 shrink-0 rounded object-cover" /> : <div className="h-16 w-11 shrink-0 rounded bg-ink-700" />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {h.title} {h.year && <span className="text-zinc-500">({h.year})</span>} <span className="ml-1 rounded bg-ink-700 px-1 text-[10px] uppercase text-zinc-400">{h.type === 'tv' ? 'Serie' : 'Film'}</span>
                  </p>
                  {h.overview && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{h.overview}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ----- Bearbeiten / Entfernen: eigene Filme ----- */}
      {!form && tab === 'edit' && (
        <div className="mt-4">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input value={editQuery} onChange={(e) => setEditQuery(e.target.value)} placeholder="Eigenen Film suchen (Titel)…" className="w-full rounded-xl border border-ink-700 bg-ink-800 py-2.5 pl-10 pr-3 text-sm focus:border-accent/60" />
          </div>
          <div className="mt-3 divide-y divide-ink-800">
            {editQuery.trim() === '' && <p className="py-6 text-center text-sm text-zinc-500">Tippe einen Titel ein, um zu bearbeiten oder zu entfernen.</p>}
            {editList.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate text-sm">
                  <span className="text-zinc-500">{m.id}</span> · {m.title} {m.year && <span className="text-zinc-500">({m.year})</span>}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button onClick={() => editExisting(m.id)} disabled={busy} className="rounded-md bg-ink-800 px-2.5 py-1 text-xs hover:bg-ink-700">Bearbeiten</button>
                  <button onClick={() => del(m.id, m.title)} disabled={busy} className="rounded-md bg-red-500/15 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/25">Entfernen</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ----- Formular ----- */}
      {form && (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              {form.id} {form.tmdb_override ? <span className="text-zinc-500">· TMDB {String(form.tmdb_override)}</span> : null}
            </h2>
            <button onClick={() => setForm(null)} className="rounded-full p-1 text-zinc-500 hover:bg-ink-700" aria-label="Schließen"><IconClose width={16} height={16} /></button>
          </div>
          {GROUPS.map((g) => (
            <div key={g.group} className="mb-4">
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{g.group}</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((f) => (
                  <label key={f.k} className="block">
                    <span className="mb-0.5 block text-[11px] text-zinc-500">{f.l}</span>
                    {f.t === 'select' ? (
                      <select value={String(form[f.k] ?? '')} onChange={(e) => set(f.k, e.target.value)} className="w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm focus:border-accent/60">
                        {f.o!.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
                      </select>
                    ) : (
                      <input type={f.t === 'number' ? 'number' : 'text'} value={String(form[f.k] ?? '')} onChange={(e) => set(f.k, e.target.value)} className="w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm focus:border-accent/60" />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="sticky bottom-0 -mx-4 flex gap-2 bg-ink-900/90 px-4 py-3 backdrop-blur-md">
            <button onClick={save} disabled={busy} className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-bold text-ink-950 hover:bg-accent-soft disabled:opacity-50">
              {busy ? 'Speichern…' : 'Speichern'}
            </button>
            <button onClick={() => setForm(null)} className="rounded-xl border border-ink-700 bg-ink-800 px-4 text-sm hover:bg-ink-700">Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}
