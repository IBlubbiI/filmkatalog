// Filmuniversum-Zuordnung: fasst verwandte Franchises zu einem gemeinsamen
// "Universum" zusammen, damit die Detailansicht unter "Weitere Filme dieser Reihe"
// auch über Sub-Reihen hinweg verlinkt (z. B. Herr der Ringe + Hobbit).
//
// Alles, was NICHT hier steht, bildet automatisch sein eigenes "Universum"
// = der Franchise-Wert aus der Excel. Zum Ergänzen einfach Zeilen hinzufügen
// und `npm run build:data` neu laufen lassen.

export const UNIVERSE_MAP = {
  'Der Herr der Ringe': 'Mittelerde',
  'Der Hobbit': 'Mittelerde',
  'Wizarding World / Harry Potter': 'Wizarding World',
  'Wizarding World / Phantastische Tierwesen': 'Wizarding World',
  // MCU: einzelne Reihen (z. B. "Iron Man / MCU") mit dem Sammelwert vereinen,
  // damit "Weitere Filme dieser Reihe" bei jedem MCU-Film alle MCU-Filme zeigt.
  'Iron Man / MCU': 'Marvel Cinematic Universe (MCU)',

  // DCEU: uneinheitliche Schreibweisen in der Excel auf EINE Reihe vereinheitlichen
  // (sonst zeigt die Sammlung "DC Extended Universe" und "… (DCEU)" getrennt).
  'DC Extended Universe': 'DC Extended Universe (DCEU)',

  // Tarantino: die Box-Varianten zu EINER Reihe zusammenfassen.
  'Tarantino XX / Kill Bill': 'Tarantino XX',
  'Tarantino XX / Grindhouse': 'Tarantino XX',

  // Drachenzähmen: Live-Action + Animationsfilme unter einer Reihe führen.
  'Drachenzähmen leicht gemacht (Live-Action)': 'Drachenzähmen leicht gemacht',

  // Astrid-Lindgren-Verfilmungen (Pippi, Michel …) zu einer Reihe zusammenfassen
  'Pippi Langstrumpf': 'Astrid Lindgren',
  'Michel aus Lönneberga': 'Astrid Lindgren',

  // Märchenfilm-Klassiker verschiedener Labels gemeinsam führen
  'Schongerfilm-Märchenklassiker (Grimm-Verfilmungen)': 'Märchenfilme',
  'MärchenKlassiker (Icestorm)': 'Märchenfilme',
};

// Per-Film-Universum – für Einträge, deren "Reihe/Franchise" in der Excel leer
// oder uneinheitlich ist (Datenlücken). ID gewinnt vor dem Franchise-Mapping.
export const UNIVERSE_BY_ID = {
  F318: 'Märchenfilme', // Drei Haselnüsse für Aschenbrödel (ohne Franchise)
  // Django & Hateful 8 gehören für den Nutzer zur Tarantino-Reihe (Franchise leer):
  F017: 'Tarantino XX',
  F018: 'Tarantino XX',
  // Augsburger Puppenkiste (Franchise teils leer):
  F353: 'Augsburger Puppenkiste',
  F354: 'Augsburger Puppenkiste',
  F355: 'Augsburger Puppenkiste',
  F356: 'Augsburger Puppenkiste',
  F357: 'Augsburger Puppenkiste',
};

// Das "Universum" (breite Sammlung-Gruppe) eines Films bestimmen.
// Konvention in der Excel-Spalte "Reihe/Franchise": "<Unter-Reihe> / <Übergeordnet>"
// – der Teil NACH dem letzten " / " ist die Sammlung-Gruppe (z. B.
// "The Dark Knight Trilogie / Christopher Nolan" → Gruppe "Christopher Nolan").
// Ein Voll-String-Eintrag in UNIVERSE_MAP hat Vorrang (für Altbestand wie
// "Iron Man / MCU" → "Marvel Cinematic Universe (MCU)").
export function universeOf(franchise, id) {
  if (id && UNIVERSE_BY_ID[id]) return UNIVERSE_BY_ID[id];
  if (!franchise) return null;
  if (UNIVERSE_MAP[franchise]) return UNIVERSE_MAP[franchise];
  if (franchise.includes(' / ')) {
    const broad = franchise.split(' / ').pop().trim();
    return UNIVERSE_MAP[broad] ?? broad;
  }
  return franchise;
}
