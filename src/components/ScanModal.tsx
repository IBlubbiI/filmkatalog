import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/data';
import { PosterImage } from './PosterImage';
import { IconClose } from './Icons';
import { yearLabel } from '../lib/format';
import type { Movie } from '../types';

const normEan = (s: string) => (s || '').replace(/\D/g, '');

/** Barcode-Scanner: EAN scannen (oder tippen) und im Katalog nachschlagen. */
export function ScanModal({ onClose }: { onClose: () => void }) {
  const data = useData();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState('');
  const [result, setResult] = useState<{ ean: string; movies: Movie[] } | null>(null);
  const [camState, setCamState] = useState<'starting' | 'running' | 'unsupported' | 'error'>('starting');

  // EAN → Filme (eine EAN kann – als Box – für mehrere Filme gelten).
  const byEan = useMemo(() => {
    const map = new Map<string, Movie[]>();
    for (const g of data.groups.values()) {
      const m = g[0];
      const e = normEan(m.ean || m.eanRaw || '');
      if (e.length < 8) continue;
      const arr = map.get(e) ?? [];
      arr.push(m);
      map.set(e, arr);
    }
    return map;
  }, [data.groups]);

  const lookup = (raw: string) => {
    const e = normEan(raw);
    if (e.length < 8) return;
    setResult({ ean: e, movies: byEan.get(e) ?? [] });
  };

  // Kamera + BarcodeDetector (wenn verfügbar).
  useEffect(() => {
    if (result) return; // bei Treffer nicht weiterscannen
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BD = (window as any).BarcodeDetector;
    if (!BD) {
      setCamState('unsupported');
      return;
    }
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    (async () => {
      try {
        const det = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCamState('running');
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await det.detect(videoRef.current);
            if (codes[0]?.rawValue) {
              lookup(codes[0].rawValue);
              return; // stoppt die Schleife
            }
          } catch {
            /* einzelne Frames können fehlschlagen */
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setCamState('error');
      }
    })();
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [result, byEan]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm animate-fade-in rounded-2xl bg-ink-850 p-4 shadow-2xl ring-1 ring-white/10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Barcode scannen</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-zinc-400 hover:bg-ink-700" aria-label="Schließen">
            <IconClose />
          </button>
        </div>

        {!result ? (
          <>
            {camState === 'running' || camState === 'starting' ? (
              <div className="relative overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} playsInline muted className="aspect-[4/3] w-full object-cover" />
                <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-accent/80 shadow-[0_0_8px] shadow-accent" />
                {camState === 'starting' && <p className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">Kamera startet…</p>}
              </div>
            ) : (
              <p className="rounded-xl bg-ink-800 p-3 text-xs text-zinc-500">
                {camState === 'unsupported'
                  ? 'Dieses Gerät/Browser kann keinen Barcode über die Kamera lesen (z. B. iPhone-Safari). Gib die EAN unten manuell ein.'
                  : 'Kein Kamerazugriff. Gib die EAN unten manuell ein.'}
              </p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                lookup(manual);
              }}
              className="mt-3 flex items-center gap-2"
            >
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                inputMode="numeric"
                placeholder="EAN manuell eingeben…"
                className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-accent/60"
              />
              <button type="submit" disabled={normEan(manual).length < 8} className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-bold text-ink-950 hover:bg-accent-soft disabled:opacity-40">
                Suchen
              </button>
            </form>
          </>
        ) : (
          <div>
            {result.movies.length === 0 ? (
              <div className="text-center">
                <p className="text-sm text-zinc-200">Nicht in deiner Sammlung.</p>
                <p className="mt-1 text-xs text-zinc-500">EAN {result.ean}</p>
                <Link to={`/verwalten`} onClick={onClose} className="mt-3 inline-block rounded-lg bg-ink-700 px-4 py-2 text-sm text-zinc-200 hover:bg-ink-600">
                  In Verwalten anlegen
                </Link>
              </div>
            ) : (
              <>
                <p className="mb-2 text-xs text-zinc-500">
                  {result.movies.length === 1 ? 'Gefunden – du besitzt ihn:' : `${result.movies.length} Titel mit dieser EAN (Box):`}
                </p>
                <div className="space-y-1">
                  {result.movies.map((m) => (
                    <Link key={m.id} to={`/film/${m.id}`} onClick={onClose} className="flex items-center gap-3 rounded-lg p-2 hover:bg-ink-800">
                      <div className="w-10 shrink-0 overflow-hidden rounded ring-1 ring-white/5">
                        <PosterImage movie={m} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">{m.title}</p>
                        <p className="truncate text-xs text-zinc-500">{[yearLabel(m), m.mainGenre].filter(Boolean).join(' · ')}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => { setResult(null); setManual(''); }} className="mt-3 w-full rounded-lg border border-ink-600 bg-ink-800 py-2 text-sm text-zinc-300 hover:border-ink-500">
              Weiter scannen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
