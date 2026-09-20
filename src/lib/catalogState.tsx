import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { emptyFilters, type FilterState } from './filters';
import type { SortKey } from './sort';
import { loadJSON, saveJSON } from './storage';

type View = 'grid' | 'list';
const KEY = 'filmkatalog.catalog.v1';
interface Persisted {
  filters: FilterState;
  sort: SortKey;
  view: View;
}

interface CatalogCtx {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  view: View;
  setView: (v: View) => void;
  search: string;
  setSearch: (s: string) => void;
  /** Von der Detailseite: nach Regisseur filtern und zum Katalog springen. */
  showDirector: (name: string) => void;
  /** Von der Detailseite: Reihe chronologisch anzeigen. */
  showFranchise: (name: string) => void;
}

const Ctx = createContext<CatalogCtx | null>(null);

export function CatalogStateProvider({ children }: { children: ReactNode }) {
  const persisted = loadJSON<Persisted>(KEY, { filters: emptyFilters(), sort: 'title', view: 'grid' });
  // Tief gegen die Defaults mergen: fehlende (neue) Filter-Felder aus alten
  // gespeicherten Zuständen werden ergänzt, statt undefined zu bleiben.
  const [filters, setFilters] = useState<FilterState>({ ...emptyFilters(), ...persisted.filters });
  const [sort, setSort] = useState<SortKey>(persisted.sort);
  const [view, setView] = useState<View>(persisted.view);
  const [search, setSearch] = useState('');

  useEffect(() => {
    saveJSON(KEY, { filters, sort, view });
  }, [filters, sort, view]);

  const showDirector = (name: string) => {
    setSearch('');
    setFilters({ ...emptyFilters(), director: name });
  };
  const showFranchise = (name: string) => {
    setSearch('');
    setFilters({ ...emptyFilters(), franchise: name });
    setSort('yearAsc'); // Reihe chronologisch
  };

  return (
    <Ctx.Provider value={{ filters, setFilters, sort, setSort, view, setView, search, setSearch, showDirector, showFranchise }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCatalog(): CatalogCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCatalog muss innerhalb von <CatalogStateProvider> stehen');
  return v;
}
