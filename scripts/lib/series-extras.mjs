// Manuelle Steuerung der automatischen Reihen-Erkennung (scripts/lib/series.mjs).
//
// Der Build entdeckt gleichnamige Ableger/Fortsetzungen SELBST (TMDB-Suche nach
// dem gemeinsamen Namensstamm, Muster "Reihe: Untertitel"). Diese Datei ist für
// die Fälle, die die Auto-Suche NICHT abdeckt:
//
//   SERIES_EXTRAS       – Titel, die anders heißen und daher nicht gefunden werden
//                         (z. B. Autoren-Reihen wie Astrid Lindgren). Schlüssel =
//                         Reihe/Universum-Wert (universe bzw. franchise) aus der Excel.
//   SERIES_DENY         – TMDB-IDs, die fälschlich reinrutschen (Fehltreffer).
//   SERIES_NO_DISCOVERY – Reihen, für die die Auto-Suche komplett aus bleibt
//                         (zu viele Einzelfolgen/Varianten, z. B. Augsburger Puppenkiste).
//
// Nach Änderungen `npm run build:data` (oder build:series) neu laufen lassen.

export const SERIES_EXTRAS = {
  // Christopher-Nolan-Filme, die (noch) nicht im Besitz sind – Regisseur-Reihe.
  'Christopher Nolan': [
    { tmdbId: 11660, type: 'movie' }, // Following (1998)
    { tmdbId: 77, type: 'movie' }, // Memento (2000)
    { tmdbId: 320, type: 'movie' }, // Insomnia – Schlaflos (2002)
    { tmdbId: 872585, type: 'movie' }, // Oppenheimer (2023)
    { tmdbId: 1368337, type: 'movie' }, // Die Odyssee (2026)
  ],

  // Ableger/Serien/Spinoffs mit ABWEICHENDEM Namen (findet die Auto-Suche nicht).
  Ghostbusters: [{ tmdbId: 43074, type: 'movie' }], // Ghostbusters (2016, "Answer the Call")
  'John Wick': [{ tmdbId: 541671, type: 'movie' }], // Ballerina (2025)
  'Star Wars': [
    { tmdbId: 348350, type: 'movie' }, // Solo
    { tmdbId: 12180, type: 'movie' }, // The Clone Wars (2008, Film)
    { tmdbId: 82856, type: 'tv' }, // The Mandalorian
    { tmdbId: 83867, type: 'tv' }, // Andor
    { tmdbId: 114461, type: 'tv' }, // Ahsoka
    { tmdbId: 92830, type: 'tv' }, // Obi-Wan Kenobi
    { tmdbId: 115036, type: 'tv' }, // Das Buch von Boba Fett
    { tmdbId: 114479, type: 'tv' }, // The Acolyte
    { tmdbId: 202879, type: 'tv' }, // Skeleton Crew
    { tmdbId: 4194, type: 'tv' }, // The Clone Wars (Serie)
    { tmdbId: 60554, type: 'tv' }, // Star Wars Rebels
    { tmdbId: 105971, type: 'tv' }, // The Bad Batch
  ],
  'The Conjuring-Universum': [
    { tmdbId: 250546, type: 'movie' }, // Annabelle
    { tmdbId: 396422, type: 'movie' }, // Annabelle 2 (Creation)
    { tmdbId: 521029, type: 'movie' }, // Annabelle 3 (Comes Home)
    { tmdbId: 480414, type: 'movie' }, // Lloronas Fluch
    { tmdbId: 968051, type: 'movie' }, // The Nun II
    { tmdbId: 138843, type: 'movie' }, // Conjuring 1
    { tmdbId: 423108, type: 'movie' }, // Conjuring 3
    { tmdbId: 1038392, type: 'movie' }, // Conjuring 4: Das letzte Kapitel
  ],
  'Es/IT-Reihe': [
    { tmdbId: 474350, type: 'movie' }, // Es Kapitel 2
    { tmdbId: 200875, type: 'tv' }, // Es - Welcome to Derry
  ],
  'Downton Abbey': [
    { tmdbId: 33907, type: 'tv' }, // Downton Abbey (Serie)
    { tmdbId: 1289936, type: 'movie' }, // Downton Abbey: Das große Finale
  ],
  'Drachenzähmen leicht gemacht': [
    { tmdbId: 10191, type: 'movie' }, // Teil 1
    { tmdbId: 82702, type: 'movie' }, // Teil 2
    { tmdbId: 166428, type: 'movie' }, // Teil 3
  ],
  Dune: [{ tmdbId: 90228, type: 'tv' }], // Dune: Prophecy (2024)

  // Astrid-Lindgren-Verfilmungen: verschiedene Titel, keine TMDB-Sammlung → kuratiert.
  'Astrid Lindgren': [
    { tmdbId: 271, type: 'movie' }, // Ronja Räubertochter (1984)
    { tmdbId: 355659, type: 'movie' }, // Ferien auf Saltkrokan (1968)
    { tmdbId: 27598, type: 'movie' }, // Madita (1979)
    { tmdbId: 8445, type: 'movie' }, // Madita und Pim (1980)
    { tmdbId: 21394, type: 'movie' }, // Wir Kinder aus Bullerbü (1986)
    { tmdbId: 26111, type: 'movie' }, // Neues von uns Kindern aus Bullerbü (1987)
    { tmdbId: 11291, type: 'movie' }, // Die Brüder Löwenherz (1977)
    { tmdbId: 27599, type: 'movie' }, // Lotta zieht um (1993)
    { tmdbId: 30700, type: 'movie' }, // Meisterdetektiv Kalle Blomquist lebt gefährlich (1996)
  ],
};

// TMDB-IDs, die NIE aufgenommen werden (Fehltreffer/irrelevant) – auch aus Collections.
export const SERIES_DENY = [
  41897, // "Auch die Engel mögen's heiß" – ohne Bud Spencer/Terence Hill
  1732617, // "Pirates of the Caribbean: Other Pirates of the Caribbean" – Fake/kein Announcement
  1377658, // "Ghostbusters: Family Edition" – existiert nicht als echter Film
];

// Reihen, für die KEINE automatische Entdeckung läuft (nur eigene Titel + Sammlung).
export const SERIES_NO_DISCOVERY = new Set([
  'Augsburger Puppenkiste', // dutzende Einzelfolgen/Boxen → zu unübersichtlich
]);
