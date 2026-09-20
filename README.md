# Filmkatalog 🎬

Persönliche, **installierbare PWA** zum Durchstöbern deiner physischen Film- &
Seriensammlung. Poster-Katalog mit schnellen Filtern, Volltext-Fuzzy-Suche,
Detailansichten und Statistik. Nach dem ersten Laden **vollständig offline**
nutzbar (Homescreen auf iOS/Android).

- **Read-only.** Die Excel-Datei bleibt die einzige Wahrheit; die App schreibt
  nie zurück.
- **Kein Backend.** Alles läuft im Browser; angereichert wird einmalig lokal per
  Build-Skript über die TMDB-API.

---

## 1. Voraussetzungen

- **Node.js ≥ 18** (getestet mit Node 24)
- Ein **kostenloser TMDB-API-Key** (siehe unten). Ohne Key funktioniert alles,
  nur ohne Poster/Ratings/Inhaltsangaben.

## 2. Einrichtung

```bash
npm install
```

### TMDB-Key eintragen

1. Konto anlegen auf <https://www.themoviedb.org> → **Settings → API** →
   „Request an API Key" (Typ *Developer*).
   - Beim Feld **Application URL** genügt ein Platzhalter, z. B. `http://localhost`.
     Das Feld wird nicht geprüft.
2. Du bekommst zwei Werte – **einer reicht**:
   - **API Key (v3)** – kurz → in `.env` als `TMDB_API_KEY`
   - **API Read Access Token (v4)** – langer JWT → als `TMDB_READ_ACCESS_TOKEN`
3. `.env` anlegen (Vorlage kopieren) und Key eintragen:

```bash
cp .env.example .env
# .env öffnen und TMDB_API_KEY=... eintragen
```

Die `.env` ist in `.gitignore` und landet nie im Build oder Repo.

## 3. Daten bauen

```bash
npm run build:data
```

Das Skript liest `data/Filmsammlung.xlsx` (Sheet **„Filme – Übersicht"**),
reichert jede Zeile per TMDB an und schreibt:

| Datei | Inhalt |
|---|---|
| `public/movies.json` | fertiger Katalog inkl. Versions-Hash |
| `public/posters/` | Poster (`F001.jpg`) + Backdrops (`F001_bg.jpg`) |
| `data/build-report.md` | Was hat sich geändert? (neu / entfernt / ohne Treffer) |
| `data/tmdb-matches.md` | **Alle Zuordnungen nach Konfidenz** (🔴 prüfen, 🟢 sicher) |
| `data/tmdb-unmatched.json` | Titel ohne TMDB-Treffer (zum Nachpflegen) |
| `data/tmdb-cache.json` | Cache, damit folgende Builds schnell sind |

**Flags:**

- `node scripts/build-data.mjs --refresh` – ignoriert den Cache, fragt alles neu
  ab (aber lädt vorhandene Poster nicht erneut herunter).
- `node scripts/build-data.mjs --refresh-images` – lädt zusätzlich alle Poster neu.
- `node scripts/build-data.mjs --no-tmdb` – überspringt TMDB komplett.

### Fehlende oder falsche TMDB-Treffer korrigieren

Schau in `data/tmdb-matches.md` (🔴/🟡 = bitte prüfen) und
`data/tmdb-unmatched.json`. Korrekturen kommen in **`data/tmdb-overrides.json`**:

```json
{
  "F123": 550,
  "F200": { "id": 1399, "type": "tv" }
}
```

`F123` → erzwingt TMDB-Film-ID 550. Für Serien die Objekt-Form mit `"type": "tv"`.
Danach erneut `npm run build:data`.

## 4. App starten / bauen

```bash
npm run dev       # lokaler Dev-Server (http://localhost:5173)
npm run build     # deploybares Static-Bundle nach dist/
npm run preview   # dist/ lokal testen (inkl. Offline-Service-Worker)
```

> Der Service Worker (Offline-Modus) ist nur im **Build** aktiv, nicht im
> Dev-Server. Zum Offline-Testen: `npm run build && npm run preview`, dann im
> Browser einmal laden und in den Flugmodus gehen.

## 5. Deployment über GitHub Pages (kostenlos, kein extra Konto)

Da du GitHub nutzt, deployt die App automatisch per **GitHub Actions** – kein
Netlify/Vercel nötig. Die Action steckt schon im Repo (`.github/workflows/deploy.yml`).

**Einmalig einrichten:**

1. Repo auf GitHub anlegen und dieses Projekt pushen (die Datei
   `data/Filmsammlung.xlsx` und `data/tmdb-overrides.json` **mit committen** –
   `.env`, `node_modules/`, `dist/` und generierte Daten bleiben dank
   `.gitignore` außen vor).
2. Auf GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `TMDB_API_KEY`, Wert: dein TMDB-Key. (So bleibt der Key geheim und
     die Action kann die Poster/Ratings selbst bauen.)
3. **Settings → Pages → Build and deployment → Source: „GitHub Actions"** wählen.

**Ab dann:** Jeder `git push` auf `main` baut Daten + App neu und veröffentlicht
sie unter `https://<dein-name>.github.io/<repo>/`. Ein Excel-Update ist also:

```
Excel ersetzen  →  git add . && git commit -m "Update" && git push
```

> Lokal testen vor dem Push: `npm run deploy` (baut Daten + `dist/`), dann
> `npm run preview`.

Alternativ tut es jeder Static-Host – einfach `npm run deploy` und den Ordner
`dist/` hochladen.

---

## 6. Pflege-Workflow (nach einem Excel-Update)

Die Excel ist und bleibt führend. Der Weg ist immer:

```
Excel bearbeiten  →  data/Filmsammlung.xlsx ersetzen  →  npm run deploy
```

1. Bearbeite deine Sammlung in Excel (Sheet „Filme – Übersicht").
2. Kopiere die aktualisierte Datei nach `data/Filmsammlung.xlsx`.
3. `npm run deploy` (oder `npm run build:data && npm run build`).

Der Build:

- erzeugt `movies.json` **immer komplett neu** (nie inkrementell),
- **cached** bereits zugeordnete TMDB-Treffer → nur neue/erfolglose IDs werden
  angefragt,
- **räumt auf**: Poster ohne zugehörige Zeile werden gelöscht (mit Log),
- **prüft Konsistenz**: bricht bei doppelten IDs, fehlenden IDs oder fehlenden
  Titeln ab, statt eine kaputte `movies.json` zu schreiben,
- schreibt einen **Versions-Hash** in `movies.json`. Der Service Worker erkennt
  eine neue Version, lädt sie nach und zeigt in der App „Aktualisierte Daten
  verfügbar – Neu laden". Das Stand-Datum steht oben im Katalog.

**ID-Regel:** IDs werden nie wiederverwendet. Gibst du einen Film ab, bleibt die
ID verbrannt; der nächste neue Eintrag bekommt die nächsthöhere freie Nummer.

---

## Projektstruktur

```
filmkatalog/
├─ data/
│  ├─ Filmsammlung.xlsx      # Quelle (read-only)
│  ├─ tmdb-overrides.json    # manuelle TMDB-Korrekturen
│  └─ *.md / *.json          # generierte Reports (gitignored)
├─ scripts/
│  ├─ build-data.mjs         # Excel → movies.json (+ TMDB)
│  ├─ make-icons.mjs         # PWA-Icons aus public/icon.svg
│  └─ lib/{genre-map,tmdb}.mjs
├─ public/
│  ├─ movies.json            # generiert
│  ├─ posters/               # generiert
│  └─ icon.svg, icons/, manifest …
└─ src/
   ├─ pages/       CatalogPage, DetailPage, StatsPage
   ├─ components/  MovieCard, FilterSheet, PosterImage, RandomModal, …
   └─ lib/         data, filters, sort, search, format, storage
```

## Hinweise zur Datenqualität

- **Genres/Hauptgenre/Kategorie** kommen direkt und einheitlich aus der Excel
  (Spalten `Genre`, `Hauptgenre`, `Kategorie`). Änderungen einfach dort machen und
  neu bauen. Reihen-/Universum-Zuordnungen (z. B. Mittelerde, Astrid Lindgren)
  liegen in `scripts/lib/universe-map.mjs`, die Label→Studio-Normalisierung in
  `scripts/lib/label-map.mjs`.
- **Gesehen**, **eigene Bewertung**, **Standort**, **Verliehen an** sind in der
  Excel aktuell fast leer. Die zugehörigen Filter/Sortierungen existieren, zeigen
  aber erst Daten, sobald du die Spalten pflegst.
- **Offline-Cache:** Beim ersten Laden werden alle Poster (~65 MB) vorab
  gecached, damit die App komplett offline läuft. Willst du das erste Laden
  leichter machen, kann man in `vite.config.ts` das Poster-Precaching auf
  „bei Bedarf cachen" umstellen.
