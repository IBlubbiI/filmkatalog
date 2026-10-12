// Autoren (Notizen & Bewertungen) samt fester Farbe – an einer Stelle, damit
// Detailseite, Katalog-Karten und Filter dieselben Namen/Farben verwenden.

// Vorschläge für den Autor (erweiterbar – man kann auch einen neuen Namen tippen).
export const NOTE_AUTHORS = ['Thomas', 'Hannah', 'Ursula'];
export const NOTE_AUTHOR_KEY = 'filmkatalog.note.author';

// Feste Farbe je Autor (Notizen, Name, Bewertung). Unbekannte Autoren bekommen
// über einen stabilen Hash eine eigene Farbe aus der Palette.
const AUTHOR_COLORS: Record<string, string> = {
  Thomas: '#2dd4bf', // Türkis
  Hannah: '#f87171', // Rot
  Ursula: '#c084fc', // Violett
};
const FALLBACK_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c'];

export function authorColor(name: string): string {
  if (AUTHOR_COLORS[name]) return AUTHOR_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}
