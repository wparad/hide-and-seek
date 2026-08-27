# Hide & Seek Zurich

Mobile-first Vue 3 static site for a ZVV train station guessing game.
Deployed to GitHub Pages from `dist/`.

## Repository

- Remote: `git@github.com:wparad/hide-and-seek.git`
- GitHub Pages base path: `/hide-and-seek/`
- Deployed: https://warrenparad.net/hide-and-seek

## Commands

| Command | What |
|---------|------|
| `npm run start` | Vite dev server (port 8080) |
| `npm run build` | Type-check + production build |
| `npm run check` | Type-check + ESLint + Prettier |
| `npm run test` | Vitest |

## Key files

| File | Role |
|------|------|
| `src/store.ts` | Singleton reactive store — all state, actions, history, localStorage |
| `src/stations.ts` | Static data — 180 stations with coordinates and line mappings |
| `src/App.vue` | Root layout — header, tab switching, bottom tab bar |
| `src/components/SettingsTab.vue` | Reset button + confirmation modal, map layer toggles |
| `src/components/StationList.vue` | Primary game screen — checkboxes to cross off stations, view filters (line, status, text) |

## Data flow

1. `stations.ts` exports the full station list (bundled at build time, never in localStorage)
2. `store.ts` holds one unified `ToolEntry[]` history in reactive state, persisted to localStorage
   key `hide-and-seek-zurich`. Every way of crossing off a station — manual toggle, bulk mark-off,
   the bisect/radius/endgame/distance map tools — is a `ToolEntry` with its own `type`, `enabled`
   flag, and the exact `stations` list it produces. Nothing mutates a crossed-off set directly.
3. `crossedOff` is a computed union of every *enabled* entry's `stations` — disabling an entry
   (rather than deleting it) is the normal way to undo a tool's application.
4. Components read from the store singleton via `useStore()`

## Station data provenance

- Primary source: OpenStreetMap Overpass API — `node[network=ZVV][train=yes]`, deduplicated
- Line mappings: `relation[network=ZVV][route=train]` — 31 S-Bahn lines (S2–S42 including S17, S18)
- Secondary source: ZVV GTFS feed (`data/`) — used to fill S18 (Forchbahn) and S17 (Limmattal) gaps
- 198 stations total, some still have `lines: []` (Dolderbahn, naming variants like "Au" vs "Au ZH")
- Raw GeoJSON kept as `train-stations.json` for reference

## Rules

- NEVER store station data in localStorage — it's static and bundled
- NEVER modify `stations.ts` by hand — regenerate from Overpass data if updates are needed
- Every tool history entry gets a unique ID (`crypto.randomUUID()`) and is togglable
- `crossedOff` is always derived, never written to directly — add a `ToolEntry` instead

## Data Maintenance

Station line assignments are verified using the stationboard API. To re-run the analysis:

1. **Fetch stationboard data**: `npx tsx scripts/fetch-line-routes.ts`
   - Queries transport.opendata.ch for each station (Saturday 10:00, limit 300, max 2 pages)
   - Results cached in `data/stationboard-results.json` (resumable on crash)
   - Stations returning no results: S17/S18 (different API category), or construction closures

2. **Compare with current data**: `npx tsx scripts/compare-stationboard.ts`
   - Shows discrepancies between stationboard results and hardcoded `lines` arrays
   - Ignores S17/S18 lines (private operators, not returned as category 'S')
   - Ignores construction-affected stations (manually tracked)

3. **Known limitations**:
   - API uses station name "Uetikon" for "Uetikon am See" — script handles this
   - S17 (Limmattal Bahn) and S18 (Forchbahn) use non-'S' categories in the API
   - Construction closures cause legitimate stations to return empty — don't remove them
   - GTFS data (gtfs.geops.ch) marks pass-throughs as stops — unreliable for line assignments
   - Stationboard is the ground truth for which lines serve a station

### Canton borders & Switzerland outline

`src/canton-borders.ts` and `src/switzerland-mask.ts` are generated, not hand-written — OSM has
no `place=state` nodes for Swiss cantons, so the map draws its own canton/country border labels
and the "outside Switzerland" hatch overlay from this bundled data instead of the vendor style.

- Regenerate: `npx tsx scripts/fetch-canton-borders.ts && npm run format`
- Source: the `swiss-maps` npm package (TopoJSON derived from swisstopo data), pinned to a
  specific published version/year in the script
- Canton names aren't in the data, only geometry ordered by the official BFS/swisstopo canton
  number (1 Zürich … 26 Jura) — `CANTON_NAMES` in the script mirrors that order positionally
