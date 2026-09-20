// Label-Normalisierung: aus 135 uneinheitlichen Freitext-Labels ein sauberes
// Studio/Vertrieb-Label ableiten (z. B. "Warner Home Video Germany" -> "Warner Bros.").
//
// Reihenfolge = Priorität: das erste passende Stichwort gewinnt. Bewusst so
// sortiert, dass bei zusammengesetzten Labels ("20th Century Fox / MGM") das
// prägnantere Studio zuerst greift. Kein Treffer -> Originalwert bleibt erhalten.
//
// Erweiterbar: Zeilen ergänzen/umsortieren und `npm run build:data` neu laufen lassen.

const RULES = [
  [/disney|buena vista/i, 'Walt Disney'],
  [/warner|new line/i, 'Warner Bros.'],
  [/universal/i, 'Universal'],
  [/paramount/i, 'Paramount'],
  [/\bsony\b|columbia|tristar/i, 'Sony / Columbia'],
  [/20th century|twentieth century|\bfox\b/i, '20th Century Fox'],
  [/\bmgm\b/i, 'MGM'],
  [/lionsgate|lions gate/i, 'Lionsgate'],
  [/dreamworks/i, 'DreamWorks'],
  [/arthaus|arthouse/i, 'Arthaus'],
  [/studiocanal/i, 'Studiocanal'],
  [/constantin/i, 'Constantin Film'],
  [/leonine/i, 'Leonine'],
  [/concorde/i, 'Concorde'],
  [/koch media/i, 'Koch Media'],
  [/icestorm|schongerfilm|förster-film/i, 'Icestorm / Schongerfilm'],
  [/studio 100/i, 'Studio 100'],
  [/kiddinx|bavaria/i, 'Kiddinx / Bavaria'],
  [/lucasfilm/i, 'Lucasfilm'],
  [/\bbbc\b/i, 'BBC'],
  [/turbine/i, 'Turbine Medien'],
  [/starmovie/i, 'Starmovie'],
  [/tobis/i, 'Tobis'],
  [/universum|hessischer rundfunk/i, 'Universum Film'],
  [/3l film|cargo/i, '3L / Cargo'],
];

export function canonicalLabel(raw) {
  if (!raw) return null;
  for (const [re, name] of RULES) if (re.test(raw)) return name;
  return raw.trim(); // unbekannt -> Originalwert behalten
}
