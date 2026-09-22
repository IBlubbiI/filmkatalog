import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { DataProvider, useData } from './lib/data';
import { CatalogStateProvider } from './lib/catalogState';
import { UserDataProvider } from './lib/userData';
import { DriveSyncProvider } from './lib/driveSync';
import { CatalogPage } from './pages/CatalogPage';
import { DetailPage } from './pages/DetailPage';
import { StatsPage } from './pages/StatsPage';
import { SammlungPage } from './pages/SammlungPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { IconClose } from './components/Icons';

function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-[92%] max-w-sm items-center gap-3 rounded-xl bg-ink-750 px-4 py-3 shadow-xl ring-1 ring-white/10 animate-fade-in">
      <p className="flex-1 text-sm text-zinc-200">Aktualisierte Daten verfügbar.</p>
      <button onClick={() => updateServiceWorker(true)} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-ink-950 hover:bg-accent-soft">
        Neu laden
      </button>
      <button onClick={() => setNeedRefresh(false)} className="rounded-full p-1 text-zinc-400 hover:bg-ink-700" aria-label="Schließen">
        <IconClose width={16} height={16} />
      </button>
    </div>
  );
}

function DataError() {
  const { error } = useData();
  if (!error) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-red-900/90 px-4 py-2 text-center text-sm text-red-100">
      movies.json konnte nicht geladen werden ({error}). Läuft der Build? <code>npm run build:data</code>
    </div>
  );
}

export default function App() {
  return (
    <DataProvider>
      <UserDataProvider>
        <DriveSyncProvider>
        <CatalogStateProvider>
        <HashRouter>
          <DataError />
          <Routes>
            <Route path="/" element={<CatalogPage />} />
            <Route path="/film/:id" element={<DetailPage />} />
            <Route path="/sammlung" element={<SammlungPage />} />
            <Route path="/entdecken/:tmdbId" element={<DiscoverPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <UpdateToast />
        </HashRouter>
        </CatalogStateProvider>
        </DriveSyncProvider>
      </UserDataProvider>
    </DataProvider>
  );
}
