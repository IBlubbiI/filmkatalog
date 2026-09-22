export interface CastMember {
  name: string;
  character: string | null;
  profile: string | null; // TMDB-Profilpfad (/xxx.jpg) oder null
}

export interface TmdbCollection {
  id: number;
  name: string;
}

export interface Tmdb {
  tmdbId: number;
  rating: number | null;
  votes: number | null;
  overview: string | null;
  poster: string | null;
  backdrop: string | null;
  cast: CastMember[];
  collection: TmdbCollection | null;
}

export interface Movie {
  id: string;
  title: string;
  originalTitle: string;
  directors: string[];
  franchise: string | null;
  universe: string | null;
  category: string | null;
  genres: string[];
  genresAll: string[];
  mainGenre: string | null;
  year: number | null;
  yearRaw: string | null;
  decade: string | null;
  discFormat: string | null;
  is4kDisc: boolean;
  hasBluray: boolean;
  hasDvd: boolean;
  discCount: number | null;
  discCountRaw: string | null;
  edition: string | null;
  box: string | null;
  boxKey: string | null;
  label: string | null;
  labelMain: string | null;
  ean: string | null;
  eanRaw: string | null;
  fsk: number | null;
  runtime: number | null;
  hdr: string | null;
  hdrRaw: string | null;
  hasHdr: boolean;
  hasDolbyVision: boolean;
  native4k: string | null;
  aspectRatio: string | null;
  audioOriginal: string | null;
  audioGerman: string | null;
  atmos: string | null;
  extendedCut: boolean;
  ecRuntime: string | null;
  ecDisc: string | null;
  ecAudio: string | null;
  subtitlesDe: string | null;
  bonus: string | null;
  digitalCopy: boolean;
  location: string | null;
  seen: boolean | null;
  rating: number | null;
  lentTo: string | null;
  type: 'Film' | 'Serie';
  duplicateIds: string[];
  tmdb: Tmdb | null;
  /** Zur Laufzeit gesetzt: Schlüssel der Ausgaben-Gruppe (gleicher Film, versch. Disc). */
  groupId?: string;
}

export interface MoviesDoc {
  version: string;
  generatedAt: string;
  count: number;
  movies: Movie[];
}
