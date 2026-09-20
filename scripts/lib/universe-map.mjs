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
  // Augsburger Puppenkiste (Franchise teils leer):
  F353: 'Augsburger Puppenkiste',
  F354: 'Augsburger Puppenkiste',
  F355: 'Augsburger Puppenkiste',
  F356: 'Augsburger Puppenkiste',
  F357: 'Augsburger Puppenkiste',
};

export function universeOf(franchise, id) {
  if (id && UNIVERSE_BY_ID[id]) return UNIVERSE_BY_ID[id];
  if (!franchise) return null;
  return UNIVERSE_MAP[franchise] ?? franchise;
}
