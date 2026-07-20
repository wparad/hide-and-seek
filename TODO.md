# TODO

## Station list

- Per-station action button to add/remove train lines from that station
- Filter by name character count (spaces and dashes count as characters)
- History tab shows check/uncheck actions (what was crossed off and restored)

## Actions tab

- Check all / uncheck all shortcut buttons

## Map

- Display stations on an interactive map (Leaflet or MapLibre GL), color-code available vs crossed off
- Disable tilt/pitch gesture — "prevent the map screen from utilizing the tilting gesture."
- International and cantonal borders — "international borders and kantonal borders."
- Altitude display — "altitude display".

## Bisect tool

- Green/red mark-off highlight — "display green highlight and red highlight on the bisect rather than
  the nothing and yellow, for stations that will stoy and get marked when executed. right now it's
  super confusing".
- New start/endpoint UX — "the bisect tool should work different UX. we should first select the
  first starting point and then the endpoint point should be the bisect scissor handler instead of
  right now where we are selecting the center point which is shit."

## Radius tool

- Middle-point display — "for manual distances tracking. the radius tool should support a middle
  point display."

## Radius & bisect (shared behaviour)

- Disable station clicks while a tool is active + snap to tapped station — "when the radius or bisect
  tool is working the stations click handlers should be disabled (and renamed on cancelling classic
  the tools). and if pressed should snap the current point to that station center".

## Reachability

- Live progress while running — "display reach analyzer current progress while running".

## Endgame

- Fullscreen draw + save line on white background — "draw line on endgame when the edit pencil is
  pressed it should expand the map to be the whole display, and lock moving it, until the pencil is
  pressed again. on save, we should extract the line, replace the map with a white background, so
  only the line can be seen, and then offer then attempt to save / download, automatically. report
  errors with that as a toast, and successes also with a toast. name the file with the timestamp in
  Unix seconds".
- Inside/outside radius zones (generalize exclusion zones) — "for the exclusion zones in the endgame.
  it won't just be exclusion zones but a radius tool, that is a question \"inside? \" yes or no
  answer. yes shrinks the remaining disployed end game hiding zone Display to only that area. a no
  answer does the same as the exclusion zones does today. for a yes answer the display hiding zone
  remaining shown should have the same opacity as the default hiding zone."
- Share button + zone query params — "we need to support a shore button which shares all zones added,
  which means we need to capture the zones in a query parameter for the endgame tab, and we also need
  to drive updates to the map based on loading those query .parameters."

## Game mode

- "New game" flow — randomly pick a secret station, track guesses, show win state
- Multiplayer: one device picks the station, another device guesses (share via URL or QR code)

## UX polish

- Dark mode
- Animations for station list changes (Vue transition-group)
- PWA manifest + service worker for offline use

## Deployment

- GitHub Actions workflow for automatic deploy on push to main
