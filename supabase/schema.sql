-- Filmkatalog: Tabelle "movies" (Quelle = ehemals Excel)
create table if not exists movies (
  id text primary key,
  title_de text,
  title_original text,
  year integer,
  director text,
  franchise text,
  genre text,
  main_genre text,
  disc_format text,
  discs integer,
  edition text,
  box text,
  label text,
  ean text,
  fsk text,
  runtime_min integer,
  hdr text,
  native_4k text,
  aspect_ratio text,
  audio_ov text,
  audio_de text,
  atmos text,
  extended_cut text,
  ec_extra_runtime text,
  ec_on_disc text,
  ec_audio text,
  subtitles_de text,
  bonus text,
  digital_copy text,
  location text,
  seen text,
  rating numeric(3,1),
  lent_to text,
  type text,
  other_copies text,
  category text,
  tmdb_override integer,
  poster_override text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- updated_at automatisch pflegen
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_movies_updated on movies;
create trigger trg_movies_updated before update on movies for each row execute function set_updated_at();

-- Zugriff: öffentlich lesbar (wie bisher movies.json); Schreiben kommt später mit Login.
alter table movies enable row level security;
drop policy if exists "public read movies" on movies;
create policy "public read movies" on movies for select using (true);
