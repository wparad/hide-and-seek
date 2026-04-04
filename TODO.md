# TODO

## Core features

- Map tab — display stations on an interactive map (Leaflet or MapLibre GL), color-code remaining vs eliminated
- Station detail view — tap a station to see its lines, coordinates, elimination status

## Filters

- Filter by station name length (e.g., "name has exactly 8 characters")
- Filter by position in name (e.g., "3rd character is 'r'")
- Filter by number of lines serving the station
- Combine character filters with AND/OR logic

## History improvements

- Drag to reorder actions (changes the filter application order)
- Bulk toggle — enable/disable all actions at once
- Export/import action history as JSON (share a game state)

## Admin — station data management

- Edit train lines: for each line, show all stations as checkboxes; add stations via search box, remove by unchecking
- Remove stations from the dataset entirely (e.g., duplicates like "Au" vs "Au ZH", non-S-Bahn stops)
- Add custom stations or lines not in the OSM data
- Persist admin edits to localStorage separately from game state

## Game mode

- "New game" flow — randomly pick a secret station, track guesses, show win state
- Multiplayer: one device picks the station, another device guesses (share via URL or QR code)
- Guess counter and timer

## UX polish

- Dark mode
- Animations for station list changes (Vue transition-group)
- Haptic feedback on mobile actions
- PWA manifest + service worker for offline use
- Keyboard shortcuts for desktop use

## Deployment

- GitHub Actions workflow for automatic deploy on push to main
