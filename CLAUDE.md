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
| `src/components/ActionsTab.vue` | Reset button + confirmation modal |
| `src/components/HistoryList.vue` | Toggle/delete actions |
| `src/components/StationList.vue` | Primary game screen — checkboxes to cross off stations, view filters (line, status, text) |

## Data flow

1. `stations.ts` exports the full station list (bundled at build time, never in localStorage)
2. `store.ts` holds `GameAction[]` in reactive state, persisted to localStorage key `hide-and-seek-zurich`
3. `crossedOff: string[]` tracks individually eliminated stations, persisted to localStorage
4. `filteredStations` is a computed that replays all enabled actions against the full station list
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
- Every filter action gets a unique ID (`crypto.randomUUID()`) and is togglable
- The filter chain is deterministic: same enabled actions in same order → same result
