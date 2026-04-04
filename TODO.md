# TODO

## Station list

- Per-station action button to add/remove train lines from that station
- Filter by name character count (spaces and dashes count as characters)
- History tab shows check/uncheck actions (what was crossed off and restored)

## Actions tab

- Check all / uncheck all shortcut buttons

## Map

- Display stations on an interactive map (Leaflet or MapLibre GL), color-code available vs crossed off

## Station data

- Resolve remaining stations with `lines: []` (Dolderbahn, Dietikon AVA, naming variants)
- Identify missing S-Bahn lines in the S2-S43 range not yet in the dataset

## Game mode

- "New game" flow — randomly pick a secret station, track guesses, show win state
- Multiplayer: one device picks the station, another device guesses (share via URL or QR code)

## UX polish

- Dark mode
- Animations for station list changes (Vue transition-group)
- PWA manifest + service worker for offline use

## Deployment

- GitHub Actions workflow for automatic deploy on push to main
