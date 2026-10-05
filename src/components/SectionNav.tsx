import { Link } from 'react-router-dom';
import { IconHome, IconLayers, IconChart, IconDisc } from './Icons';

export type Section = 'katalog' | 'sammlung' | 'stats' | 'verwalten';

const SECTIONS: { key: Section; to: string; label: string; icon: typeof IconHome }[] = [
  { key: 'katalog', to: '/', label: 'Katalog', icon: IconHome },
  { key: 'sammlung', to: '/sammlung', label: 'Sammlung', icon: IconLayers },
  { key: 'stats', to: '/stats', label: 'Statistik', icon: IconChart },
  { key: 'verwalten', to: '/verwalten', label: 'Verwalten', icon: IconDisc },
];

/** Einheitliche Navigation zu den anderen Bereichen (auf jeder Seite oben). */
export function SectionNav({ current }: { current: Section }) {
  return (
    <nav className="flex items-center gap-1">
      {SECTIONS.filter((s) => s.key !== current).map((s) => {
        const Icon = s.icon;
        return (
          <Link
            key={s.key}
            to={s.to}
            aria-label={s.label}
            title={s.label}
            className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-ink-800 hover:text-zinc-100"
          >
            <Icon width={18} height={18} />
          </Link>
        );
      })}
    </nav>
  );
}
