<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore, type MapLayerVisibility } from '../store'
import { stations, locations, buildGeoLines } from '../stations'

const store = useStore()
const mapEl = ref<HTMLDivElement | null>(null)
const hideCrossedOff = ref(false)
const showLocations = ref(true)
let map: maplibregl.Map | null = null
let popup: maplibregl.Popup | null = null
let popupStation: string | null = null

const pendingCrossOff = ref('')
const showReasonModal = ref(false)
const reasonText = ref('')

// Radius tool state
const radiusMode = ref(false)
const radiusMeters = ref(5000)
const radiusCenter = ref<[number, number] | null>(null)
const stationsInRadius = ref<Set<string>>(new Set())

// Scissor (bisect) tool state
const scissorMode = ref(false)
const scissorLocked = ref(false) // true when loaded from URL — read-only mode
const scissorCenter = ref<[number, number] | null>(null)
const scissorAngle = ref(90) // degrees, 90 = vertical (north-south) bisect
const scissorDistance = ref(500) // meters — distance between the two endpoint indicators
const scissorFlipped = ref(false)
const scissorReversed = ref(false) // swaps which endpoint is start vs end
const SCISSOR_DISTANCES = [500, 1000, 2000, 3000, 4000, 5000]
const stationsOnScissorSide = ref<Set<string>>(new Set())
const scissorMarkOffCount = computed(
  () => [...stationsOnScissorSide.value].filter((n) => !(n in store.crossedOff)).length,
)
const radiusInsideCount = computed(
  () => [...stationsInRadius.value].filter((n) => !(n in store.crossedOff)).length,
)
const radiusOutsideCount = computed(
  () =>
    stations.filter((s) => !stationsInRadius.value.has(s.name) && !(s.name in store.crossedOff))
      .length,
)
// Handle offset: fixed 80px from center in screen space, converted to lng/lat on each update
const HANDLE_OFFSET_PX = 80
let scissorHandle: maplibregl.Marker | null = null
let scissorCenterMarker: maplibregl.Marker | null = null
let scissorEndpointA: maplibregl.Marker | null = null
let scissorEndpointB: maplibregl.Marker | null = null
let hotterMarker: maplibregl.Marker | null = null
let colderMarker: maplibregl.Marker | null = null
let arrowHeadA: maplibregl.Marker | null = null
let arrowHeadB: maplibregl.Marker | null = null

// GPS location state
const userLocation = ref<[number, number] | null>(null)
let gpsWatchId: number | null = null
let gpsMarker: maplibregl.Marker | null = null

const LAYER_GROUPS: Record<keyof MapLayerVisibility, RegExp> = {
  roads:
    /^(tunnel_(motorway|service|link|street|minor|secondary|tertiary|trunk|primary|path)|road_(area|motorway|service|link|minor|secondary|tertiary|trunk|primary|path|one_way)|bridge_(motorway|service|link|street|path|secondary|tertiary|trunk|primary)|highway-shield|road_shield)/,
  rail: /^(tunnel_(major_rail|transit_rail)|road_(major_rail|transit_rail)|bridge_(major_rail|transit_rail))/,
  labels: /^(label_|waterway_line_label|water_name_|highway-name)/,
  buildings: /^building/,
  poi: /^(poi_|airport)/,
  boundaries: /^boundary/,
  water: /^(water|waterway)/,
  landuse: /^(landuse_|landcover_|park)/,
}

function syncMapLayers() {
  if (!map) return
  const style = map.getStyle()
  if (!style) return
  for (const layer of style.layers) {
    for (const [group, pattern] of Object.entries(LAYER_GROUPS)) {
      if (pattern.test(layer.id)) {
        const visible = store.mapLayers[group as keyof MapLayerVisibility]
        map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none')
        break
      }
    }
  }
}

function openPopup(name: string, lngLat: maplibregl.LngLatLike) {
  if (!map) return
  popupStation = name
  popup?.remove()
  popup = new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
    .setLngLat(lngLat)
    .setHTML(buildPopupHTML(name))
    .addTo(map)
  popup.getElement()?.addEventListener('click', onPopupClick)
}

function buildPopupHTML(name: string): string {
  const crossed = name in store.crossedOff
  const fav = store.favorites.includes(name)
  const lines = store.getStationLines(name)
  const linesText = lines.length ? lines.join(', ') : 'no line data'
  const query = encodeURIComponent(`${name} Bahnhof ZVV`)
  const reason = store.getCrossOffReason(name)
  const reasonHtml =
    crossed && reason ? `<div class="map-popup-reason">Reason: ${reason}</div>` : ''
  return `
    <div class="map-popup">
      <div class="map-popup-header">
        <div class="map-popup-name">${name}</div>
        <button class="map-popup-fav${fav ? ' active' : ''}" data-action="favorite">${fav ? '★' : '☆'}</button>
      </div>
      <div class="map-popup-lines">${linesText}</div>
      ${reasonHtml}
      <label class="map-popup-check">
        <input type="checkbox" data-action="toggle" ${crossed ? '' : 'checked'} />
        <span>${crossed ? 'Marked off' : 'Available'}</span>
      </label>
      <a class="map-popup-link" href="https://www.google.com/search?q=${query}" target="_blank" rel="noopener">
        Search Google
      </a>
    </div>
  `
}

function onPopupClick(e: Event) {
  const target = e.target as HTMLElement
  if (target.dataset.action === 'toggle' && popupStation) {
    if (popupStation in store.crossedOff) {
      // Restoring — no reason needed
      store.toggleStation(popupStation)
      refreshPopup()
    } else {
      // Crossing off — show reason modal
      pendingCrossOff.value = popupStation
      reasonText.value = ''
      showReasonModal.value = true
    }
  }
  if (target.dataset.action === 'favorite' && popupStation) store.toggleFavorite(popupStation)
}

function confirmMapCrossOff() {
  store.toggleStation(pendingCrossOff.value, reasonText.value || 'Manual')
  showReasonModal.value = false
  pendingCrossOff.value = ''
  reasonText.value = ''
  refreshPopup()
}

function cancelMapCrossOff() {
  showReasonModal.value = false
  pendingCrossOff.value = ''
  reasonText.value = ''
  refreshPopup()
}

function refreshPopup() {
  if (!popup || !popupStation) return
  popup.setHTML(buildPopupHTML(popupStation))
  popup.getElement()?.addEventListener('click', onPopupClick)
}

type Status = 'available' | 'crossed-off' | 'filtered-out'

function stationStatus(name: string): Status {
  if (name in store.crossedOff) return 'crossed-off'
  if (store.filteredStations.value.some((s) => s.name === name)) return 'available'
  return 'filtered-out'
}

// Haversine distance in meters between two [lng, lat] points
function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Generate a GeoJSON polygon circle (approximation with 64 segments)
function buildCircleGeoJSON(center: [number, number], radiusM: number): GeoJSON.FeatureCollection {
  const points = 64
  const coords: [number, number][] = []
  const km = radiusM / 1000
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI
    const dx = km * Math.cos(angle)
    const dy = km * Math.sin(angle)
    const lng = center[0] + dx / (111.32 * Math.cos((center[1] * Math.PI) / 180))
    const lat = center[1] + dy / 110.574
    coords.push([lng, lat])
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: {},
      },
    ],
  }
}

function updateRadiusCircle() {
  if (!map) return
  const source = map.getSource('radius-circle') as maplibregl.GeoJSONSource | undefined
  if (!source) return

  if (!radiusCenter.value) {
    source.setData({ type: 'FeatureCollection', features: [] })
    stationsInRadius.value = new Set()
    return
  }

  source.setData(buildCircleGeoJSON(radiusCenter.value, radiusMeters.value))

  // Find stations within radius
  const inRange = new Set<string>()
  for (const s of stations) {
    if (haversineMeters(radiusCenter.value, s.coordinates) <= radiusMeters.value) {
      inRange.add(s.name)
    }
  }
  stationsInRadius.value = inRange
}

function handleMapClick(e: maplibregl.MapMouseEvent) {
  if (scissorMode.value) {
    scissorCenter.value = [e.lngLat.lng, e.lngLat.lat]
    updateScissorLayers()
    return
  }
  if (!radiusMode.value) return
  radiusCenter.value = [e.lngLat.lng, e.lngLat.lat]
  updateRadiusCircle()
  // Refresh station layers to show golden hue
  ;(map?.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
  ;(map?.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(buildFavGeoJSON())
}

function clearRadius() {
  radiusCenter.value = null
  radiusMode.value = false
  stationsInRadius.value = new Set()
  updateRadiusCircle()
  ;(map?.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
  ;(map?.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(buildFavGeoJSON())
}

function crossOffInRadius() {
  const names = [...stationsInRadius.value].filter((n) => !(n in store.crossedOff))
  if (names.length === 0) return
  const km =
    radiusMeters.value >= 1000
      ? `${(radiusMeters.value / 1000).toFixed(1)}km`
      : `${radiusMeters.value}m`
  store.crossOffAll(names, `Inside ${km} radius`)
}

function crossOffOutsideRadius() {
  const names = stations
    .filter((s) => !stationsInRadius.value.has(s.name) && !(s.name in store.crossedOff))
    .map((s) => s.name)
  if (names.length === 0) return
  const km =
    radiusMeters.value >= 1000
      ? `${(radiusMeters.value / 1000).toFixed(1)}km`
      : `${radiusMeters.value}m`
  store.crossOffAll(names, `Outside ${km} radius`)
}

// Scissor tool: compute two endpoint indicators at half-distance from center
function getScissorEndpoints(): [[number, number], [number, number]] | null {
  if (!scissorCenter.value) return null
  const halfDist = scissorDistance.value / 2
  const angleRad = (scissorAngle.value * Math.PI) / 180
  const [cLng, cLat] = scissorCenter.value

  const dxMeters = halfDist * Math.cos(angleRad)
  const dyMeters = halfDist * Math.sin(angleRad)
  const dLng = dxMeters / (111320 * Math.cos((cLat * Math.PI) / 180))
  const dLat = dyMeters / 110574

  return [
    [cLng + dLng, cLat + dLat],
    [cLng - dLng, cLat - dLat],
  ]
}

// Extend the bisect line across the full map viewport
function buildScissorGeoJSON(): GeoJSON.FeatureCollection {
  if (!scissorCenter.value || !map) {
    return { type: 'FeatureCollection', features: [] }
  }
  // Draw the line through center in the same screen-space direction as the handle
  const centerPx = map.project(scissorCenter.value as maplibregl.LngLatLike)
  const perpAngleRad = ((scissorAngle.value + 90) * Math.PI) / 180
  // Extend far enough in screen pixels to cover the viewport
  const extPx = 4000
  const p1Px: [number, number] = [
    centerPx.x + extPx * Math.cos(perpAngleRad),
    centerPx.y - extPx * Math.sin(perpAngleRad),
  ]
  const p2Px: [number, number] = [
    centerPx.x - extPx * Math.cos(perpAngleRad),
    centerPx.y + extPx * Math.sin(perpAngleRad),
  ]
  const p1 = map.unproject(p1Px)
  const p2 = map.unproject(p2Px)

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [p1.lng, p1.lat],
            [p2.lng, p2.lat],
          ],
        },
        properties: {},
      },
    ],
  }
}

function createScissorMarkerEl(label: string, draggable: boolean): HTMLDivElement {
  const el = document.createElement('div')
  const cursor = draggable ? 'grab' : 'default'
  el.style.cssText = `width:32px;height:32px;border-radius:50%;background:#8b5cf6;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:${cursor};box-shadow:0 2px 6px rgba(0,0,0,0.3);user-select:none;touch-action:none;`
  el.textContent = label
  return el
}

function createEndpointEl(color: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};opacity:0.9;pointer-events:none;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);`
  return el
}

// Compute handle position: fixed 80px from center along the bisect line
function getHandleLngLat(): [number, number] | null {
  if (!scissorCenter.value || !map) return null
  const centerPx = map.project(scissorCenter.value as maplibregl.LngLatLike)
  // Handle sits on the bisect line (perpendicular to endpoint axis)
  const perpAngleRad = ((scissorAngle.value + 90) * Math.PI) / 180
  const handlePx: [number, number] = [
    centerPx.x + HANDLE_OFFSET_PX * Math.cos(perpAngleRad),
    centerPx.y - HANDLE_OFFSET_PX * Math.sin(perpAngleRad), // screen Y is inverted
  ]
  const lngLat = map.unproject(handlePx)
  return [lngLat.lng, lngLat.lat]
}

function onScissorHandleDrag() {
  if (!scissorCenter.value || !scissorHandle || !map) return
  const lngLat = scissorHandle.getLngLat()
  const [cLng, cLat] = scissorCenter.value
  // Convert to screen coords to get angle — handle is on the bisect line,
  // so the endpoint axis is perpendicular to the handle direction
  const centerPx = map.project([cLng, cLat] as maplibregl.LngLatLike)
  const handlePx = map.project(lngLat)
  const dx = handlePx.x - centerPx.x
  const dy = -(handlePx.y - centerPx.y) // invert Y for math coords
  const bisectAngle = (Math.atan2(dy, dx) * 180) / Math.PI
  // Endpoint axis is perpendicular to bisect line direction (subtract 90)
  scissorAngle.value = (Math.round(bisectAngle - 90) + 360) % 360
  updateScissorVisuals()
}

function updateScissorMarkers() {
  if (!map) return

  if (!scissorCenter.value) {
    scissorHandle?.remove()
    scissorCenterMarker?.remove()
    scissorEndpointA?.remove()
    scissorEndpointB?.remove()
    scissorHandle = null
    scissorCenterMarker = null
    scissorEndpointA = null
    scissorEndpointB = null
    return
  }

  // Center marker (small dot like endpoints)
  if (!scissorCenterMarker) {
    const el = createEndpointEl('#6d28d9')
    el.style.opacity = '1'
    scissorCenterMarker = new maplibregl.Marker({ element: el })
      .setLngLat(scissorCenter.value)
      .addTo(map)
  } else {
    scissorCenterMarker.setLngLat(scissorCenter.value)
  }

  // Drag handle (single, at fixed px offset) — hidden in locked mode
  if (!scissorLocked.value) {
    const handlePos = getHandleLngLat()
    if (handlePos) {
      if (!scissorHandle) {
        scissorHandle = new maplibregl.Marker({
          element: createScissorMarkerEl('↻', true),
          draggable: true,
        })
          .setLngLat(handlePos)
          .addTo(map)
        scissorHandle.on('drag', onScissorHandleDrag)
      } else {
        scissorHandle.setLngLat(handlePos)
      }
    }
  }

  // Endpoint indicators (non-interactive) — colored by start/end
  // A is at endpoints[0] (positive direction), B at endpoints[1]
  // If reversed: B is end (hotter/red), A is start (colder/blue) — else opposite
  const endpoints = getScissorEndpoints()
  if (endpoints) {
    const endColor = '#dc2626' // red = hotter = end
    const startColor = '#2563eb' // blue = colder = start
    const colorA = scissorReversed.value ? startColor : endColor
    const colorB = scissorReversed.value ? endColor : startColor

    // Recreate to update color
    scissorEndpointA?.remove()
    scissorEndpointB?.remove()
    scissorEndpointA = new maplibregl.Marker({ element: createEndpointEl(colorA) })
      .setLngLat(endpoints[0])
      .addTo(map)
    scissorEndpointB = new maplibregl.Marker({ element: createEndpointEl(colorB) })
      .setLngLat(endpoints[1])
      .addTo(map)

    // Arrow line from start → end
    const startIdx = scissorReversed.value ? 0 : 1
    const endIdx = scissorReversed.value ? 1 : 0
    const arrowSource = map.getSource('scissor-arrow') as maplibregl.GeoJSONSource | undefined
    if (arrowSource) {
      arrowSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [endpoints[startIdx], endpoints[endIdx]],
            },
            properties: {},
          },
        ],
      })
    }

    // Two arrowhead markers at midpoints (center↔start, center↔end) in screen space
    const centerPxArrow = map.project(scissorCenter.value as maplibregl.LngLatLike)
    const startPx = map.project(endpoints[startIdx] as maplibregl.LngLatLike)
    const endPx = map.project(endpoints[endIdx] as maplibregl.LngLatLike)
    const midStartPx: [number, number] = [
      (centerPxArrow.x + startPx.x) / 2,
      (centerPxArrow.y + startPx.y) / 2,
    ]
    const midEndPx: [number, number] = [
      (centerPxArrow.x + endPx.x) / 2,
      (centerPxArrow.y + endPx.y) / 2,
    ]
    const midStartLl = map.unproject(midStartPx)
    const midEndLl = map.unproject(midEndPx)

    // Compute arrow rotation from screen-space direction (start → end)
    // CSS: 0deg = right, positive = clockwise. Screen: Y down.
    const dirX = endPx.x - startPx.x
    const dirY = endPx.y - startPx.y
    const arrowRotation = (Math.atan2(dirY, dirX) * 180) / Math.PI

    arrowHeadA?.remove()
    arrowHeadB?.remove()
    arrowHeadA = new maplibregl.Marker({
      element: createArrowEl(arrowRotation),
    })
      .setLngLat(midStartLl)
      .addTo(map)
    arrowHeadB = new maplibregl.Marker({
      element: createArrowEl(arrowRotation),
    })
      .setLngLat(midEndLl)
      .addTo(map)
  }

  // Update half-plane overlay polygons
  updateSideOverlays()

  // HOTTER/COLDER labels — positioned offset from center perpendicular to the bisect line
  updateHotColdLabels()
}

function createArrowEl(angleDeg: number): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `width:20px;height:20px;pointer-events:none;user-select:none;transform:rotate(${angleDeg}deg);`
  el.innerHTML = `<svg viewBox="0 0 20 20" width="20" height="20"><polygon points="4,2 18,10 4,18" fill="#7c3aed"/></svg>`
  return el
}

function updateSideOverlays() {
  if (!map || !scissorCenter.value) return
  const centerPx = map.project(scissorCenter.value as maplibregl.LngLatLike)
  const perpAngleRad = ((scissorAngle.value + 90) * Math.PI) / 180
  const angleRad = (scissorAngle.value * Math.PI) / 180
  const ext = 4000 // px

  // Bisect line endpoints in screen px
  const lineP1: [number, number] = [
    centerPx.x + ext * Math.cos(perpAngleRad),
    centerPx.y - ext * Math.sin(perpAngleRad),
  ]
  const lineP2: [number, number] = [
    centerPx.x - ext * Math.cos(perpAngleRad),
    centerPx.y + ext * Math.sin(perpAngleRad),
  ]

  // Hot side: extend from line toward end point direction
  const sign = scissorReversed.value ? -1 : 1
  const hotOffset: [number, number] = [
    sign * ext * Math.cos(angleRad),
    -sign * ext * Math.sin(angleRad),
  ]
  const coldOffset: [number, number] = [
    -sign * ext * Math.cos(angleRad),
    sign * ext * Math.sin(angleRad),
  ]

  const hotPoly = [
    lineP1,
    lineP2,
    [lineP2[0] + hotOffset[0], lineP2[1] + hotOffset[1]] as [number, number],
    [lineP1[0] + hotOffset[0], lineP1[1] + hotOffset[1]] as [number, number],
    lineP1,
  ].map((px) => {
    const ll = map!.unproject(px)
    return [ll.lng, ll.lat]
  })

  const coldPoly = [
    lineP1,
    lineP2,
    [lineP2[0] + coldOffset[0], lineP2[1] + coldOffset[1]] as [number, number],
    [lineP1[0] + coldOffset[0], lineP1[1] + coldOffset[1]] as [number, number],
    lineP1,
  ].map((px) => {
    const ll = map!.unproject(px)
    return [ll.lng, ll.lat]
  })

  const hotSource = map.getSource('scissor-hot-side') as maplibregl.GeoJSONSource | undefined
  const coldSource = map.getSource('scissor-cold-side') as maplibregl.GeoJSONSource | undefined
  if (hotSource) {
    hotSource.setData({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [hotPoly] }, properties: {} },
      ],
    })
  }
  if (coldSource) {
    coldSource.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coldPoly] },
          properties: {},
        },
      ],
    })
  }
}

function createLabelEl(text: string, color: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `font-size:18px;font-weight:900;color:${color};text-shadow:0 0 4px #fff,0 0 4px #fff;pointer-events:none;user-select:none;`
  el.textContent = text
  return el
}

function updateHotColdLabels() {
  if (!map || !scissorCenter.value) {
    hotterMarker?.remove()
    colderMarker?.remove()
    hotterMarker = null
    colderMarker = null
    return
  }

  const centerPx = map.project(scissorCenter.value as maplibregl.LngLatLike)
  const angleRad = (scissorAngle.value * Math.PI) / 180
  // "End" direction = toward endpoint A by default, or B if reversed
  const sign = scissorReversed.value ? -1 : 1
  const labelOffset = 120 // px from center

  // Hotter = toward end point (positive endpoint direction)
  const hotPx: [number, number] = [
    centerPx.x + sign * labelOffset * Math.cos(angleRad),
    centerPx.y - sign * labelOffset * Math.sin(angleRad),
  ]
  // Colder = toward start point (negative endpoint direction)
  const coldPx: [number, number] = [
    centerPx.x - sign * labelOffset * Math.cos(angleRad),
    centerPx.y + sign * labelOffset * Math.sin(angleRad),
  ]

  const hotLngLat = map.unproject(hotPx)
  const coldLngLat = map.unproject(coldPx)

  if (!hotterMarker) {
    hotterMarker = new maplibregl.Marker({ element: createLabelEl('HOTTER', '#dc2626') })
      .setLngLat(hotLngLat)
      .addTo(map)
  } else {
    hotterMarker.setLngLat(hotLngLat)
  }

  if (!colderMarker) {
    colderMarker = new maplibregl.Marker({ element: createLabelEl('COLDER', '#2563eb') })
      .setLngLat(coldLngLat)
      .addTo(map)
  } else {
    colderMarker.setLngLat(coldLngLat)
  }
}

function computeScissorSide() {
  const highlighted = new Set<string>()
  if (scissorCenter.value) {
    const angleRad = (scissorAngle.value * Math.PI) / 180
    // Normal to the bisect line = direction along the endpoint axis
    const nx = Math.cos(angleRad)
    const ny = Math.sin(angleRad)
    const [cLng, cLat] = scissorCenter.value
    const sign = scissorFlipped.value ? -1 : 1
    for (const s of stations) {
      const dx = s.coordinates[0] - cLng
      const dy = s.coordinates[1] - cLat
      const dot = (dx * nx + dy * ny) * sign
      if (dot > 0) highlighted.add(s.name)
    }
  }
  stationsOnScissorSide.value = highlighted
}

function updateScissorVisuals() {
  if (!map) return
  const lineSource = map.getSource('scissor-line') as maplibregl.GeoJSONSource | undefined
  if (lineSource) lineSource.setData(buildScissorGeoJSON())
  updateScissorMarkers()
  computeScissorSide()
  saveBisect()
  ;(map.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
  ;(map.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(buildFavGeoJSON())
}

function updateScissorLayers() {
  updateScissorVisuals()
}

function markOffScissorSide() {
  const names = [...stationsOnScissorSide.value].filter((n) => !(n in store.crossedOff))
  if (names.length === 0) return
  store.crossOffAll(names, 'Bisect tool')
}

const SCISSOR_STORAGE_KEY = 'hide-and-seek-bisect'

function saveBisect() {
  if (!scissorCenter.value) return
  localStorage.setItem(
    SCISSOR_STORAGE_KEY,
    JSON.stringify({
      center: scissorCenter.value,
      angle: scissorAngle.value,
      distance: scissorDistance.value,
    }),
  )
}

function loadSavedBisect() {
  try {
    const raw = localStorage.getItem(SCISSOR_STORAGE_KEY)
    if (!raw) return false
    const data = JSON.parse(raw)
    if (data.center && typeof data.angle === 'number') {
      scissorCenter.value = data.center
      scissorAngle.value = data.angle
      if (typeof data.distance === 'number') scissorDistance.value = data.distance
      return true
    }
  } catch {
    // ignore corrupt data
  }
  return false
}

function loadBisectFromUrl(): boolean {
  const param = new URLSearchParams(window.location.search).get('bisect')
  if (!param) return false
  const parts = param.split(',').map(Number)
  if (parts.length < 4 || parts.some((n) => Number.isNaN(n))) return false
  scissorCenter.value = [parts[0], parts[1]]
  scissorAngle.value = parts[2]
  scissorDistance.value = parts[3]
  if (parts.length >= 5) scissorReversed.value = parts[4] === 1
  scissorLocked.value = true
  return true
}

function getDefaultBisectCenter(): [number, number] {
  // 250m left (west) of user GPS, or map center [8.55, 47.38]
  const base: [number, number] = userLocation.value ?? [8.55, 47.38]
  const offsetLng = -250 / (111320 * Math.cos((base[1] * Math.PI) / 180))
  return [base[0] + offsetLng, base[1]]
}

function shareBisect() {
  if (!scissorCenter.value) return
  const [lng, lat] = scissorCenter.value
  const url = new URL(window.location.href)
  url.searchParams.delete('c') // don't share crossed-off state
  url.searchParams.set(
    'bisect',
    `${lng.toFixed(6)},${lat.toFixed(6)},${scissorAngle.value},${scissorDistance.value},${scissorReversed.value ? 1 : 0}`,
  )
  navigator.clipboard.writeText(url.toString())
}

function reverseEndpoints() {
  scissorReversed.value = !scissorReversed.value
  updateScissorVisuals()
}

function determineStartEndFromGps() {
  if (!scissorCenter.value || !userLocation.value) return
  const endpoints = getScissorEndpoints()
  if (!endpoints) return
  const distA = haversineMeters(userLocation.value, endpoints[0])
  const distB = haversineMeters(userLocation.value, endpoints[1])
  // Start = closer to GPS. Default: B is start. If A is closer, reverse.
  scissorReversed.value = distA < distB
}

function initGps() {
  if (!navigator.geolocation) return
  gpsWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      userLocation.value = [pos.coords.longitude, pos.coords.latitude]
      updateGpsMarker()
    },
    () => {
      // permission denied or error — no-op
    },
    { enableHighAccuracy: true },
  )
}

function createGpsMarkerEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText =
    'width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 6px rgba(59,130,246,0.6);pointer-events:none;'
  return el
}

function updateGpsMarker() {
  if (!map || !userLocation.value) return
  if (!gpsMarker) {
    gpsMarker = new maplibregl.Marker({ element: createGpsMarkerEl() })
      .setLngLat(userLocation.value)
      .addTo(map)
  } else {
    gpsMarker.setLngLat(userLocation.value)
  }
}

function clearScissor() {
  // Just hide UI — don't reset saved state
  scissorHandle?.remove()
  scissorCenterMarker?.remove()
  scissorEndpointA?.remove()
  scissorEndpointB?.remove()
  hotterMarker?.remove()
  colderMarker?.remove()
  arrowHeadA?.remove()
  arrowHeadB?.remove()
  scissorHandle = null
  scissorCenterMarker = null
  scissorEndpointA = null
  scissorEndpointB = null
  hotterMarker = null
  colderMarker = null
  arrowHeadA = null
  arrowHeadB = null
  scissorMode.value = false
  scissorLocked.value = false
  stationsOnScissorSide.value = new Set()
  if (!map) return
  const lineSource = map.getSource('scissor-line') as maplibregl.GeoJSONSource | undefined
  if (lineSource) lineSource.setData({ type: 'FeatureCollection', features: [] })
  const arrowSource = map.getSource('scissor-arrow') as maplibregl.GeoJSONSource | undefined
  if (arrowSource) arrowSource.setData({ type: 'FeatureCollection', features: [] })
  const hotSource = map.getSource('scissor-hot-side') as maplibregl.GeoJSONSource | undefined
  if (hotSource) hotSource.setData({ type: 'FeatureCollection', features: [] })
  const coldSource = map.getSource('scissor-cold-side') as maplibregl.GeoJSONSource | undefined
  if (coldSource) coldSource.setData({ type: 'FeatureCollection', features: [] })
  ;(map.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
  ;(map.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(buildFavGeoJSON())
}

function buildGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations
      .filter((s) => !store.favorites.includes(s.name))
      .filter((s) => !(hideCrossedOff.value && stationStatus(s.name) === 'crossed-off'))
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: s.coordinates },
        properties: {
          name: s.name,
          status: stationStatus(s.name),
          inRadius:
            stationsInRadius.value.has(s.name) ||
            (!scissorLocked.value && stationsOnScissorSide.value.has(s.name))
              ? 'yes'
              : 'no',
        },
      })),
  }
}

function buildFavGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations
      .filter((s) => store.favorites.includes(s.name))
      .filter((s) => !(hideCrossedOff.value && stationStatus(s.name) === 'crossed-off'))
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: s.coordinates },
        properties: {
          name: s.name,
          status: stationStatus(s.name),
          inRadius:
            stationsInRadius.value.has(s.name) ||
            (!scissorLocked.value && stationsOnScissorSide.value.has(s.name))
              ? 'yes'
              : 'no',
        },
      })),
  }
}

function buildLinesGeoJSON(): GeoJSON.FeatureCollection {
  const geoLines = buildGeoLines()
  const features: GeoJSON.Feature[] = []
  for (const [lineName, coordinates] of Object.entries(geoLines)) {
    if (coordinates.length < 2) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { line: lineName },
    })
  }
  return { type: 'FeatureCollection', features }
}

function buildLocationsGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: locations.map((loc) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: loc.coordinates },
      properties: { name: loc.name, symbol: loc.symbol },
    })),
  }
}

onMounted(() => {
  if (!mapEl.value) return
  initGps()

  map = new maplibregl.Map({
    container: mapEl.value,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [8.55, 47.38],
    zoom: 10,
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')

  map.on('load', () => {
    if (!map) return

    map.addSource('lines', { type: 'geojson', data: buildLinesGeoJSON() })
    map.addSource('stations', { type: 'geojson', data: buildGeoJSON() })
    map.addSource('favorites', { type: 'geojson', data: buildFavGeoJSON() })
    map.addSource('radius-circle', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })

    const statusColor: maplibregl.ExpressionSpecification = [
      'case',
      ['==', ['get', 'inRadius'], 'yes'],
      '#f59e0b',
      ['match', ['get', 'status'], 'available', '#22c55e', 'crossed-off', '#ef4444', '#9ca3af'],
    ]

    map.addLayer({
      id: 'lines-layer',
      type: 'line',
      source: 'lines',
      paint: {
        'line-color': '#000',
        'line-width': 3,
        'line-opacity': 0.6,
      },
    })

    map.addLayer({
      id: 'radius-circle-layer',
      type: 'fill',
      source: 'radius-circle',
      paint: {
        'fill-color': '#f59e0b',
        'fill-opacity': 0.12,
      },
    })

    map.addLayer({
      id: 'radius-circle-outline',
      type: 'line',
      source: 'radius-circle',
      paint: {
        'line-color': '#f59e0b',
        'line-width': 2,
        'line-opacity': 0.7,
      },
    })

    map.addLayer({
      id: 'stations-layer',
      type: 'circle',
      source: 'stations',
      paint: {
        'circle-radius': ['match', ['get', 'status'], 'filtered-out', 5, 8],
        'circle-color': statusColor,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': [
          'match',
          ['get', 'status'],
          'available',
          '#16a34a',
          'crossed-off',
          '#dc2626',
          '#6b7280',
        ],
        'circle-opacity': ['match', ['get', 'status'], 'filtered-out', 0.5, 1],
      },
    })

    map.addLayer({
      id: 'station-labels',
      type: 'symbol',
      source: 'stations',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 10,
        'text-offset': [0, -1.5],
        'text-anchor': 'bottom',
        'text-allow-overlap': false,
        visibility: store.showStationLabels ? 'visible' : 'none',
      },
      paint: {
        'text-color': '#333',
        'text-halo-color': '#fff',
        'text-halo-width': 1,
      },
    })

    map.addLayer({
      id: 'favorites-layer',
      type: 'symbol',
      source: 'favorites',
      layout: {
        'text-field': '★',
        'text-size': ['match', ['get', 'status'], 'filtered-out', 16, 22],
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': statusColor,
        'text-opacity': ['match', ['get', 'status'], 'filtered-out', 0.5, 1],
        'text-halo-color': '#fff',
        'text-halo-width': 1.5,
      },
    })

    // Locations (non-station POIs)
    map.addSource('locations', { type: 'geojson', data: buildLocationsGeoJSON() })
    map.addLayer({
      id: 'locations-layer',
      type: 'symbol',
      source: 'locations',
      layout: {
        'text-field': ['get', 'symbol'],
        'text-size': 28,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-opacity': 1,
      },
    })
    map.addLayer({
      id: 'locations-labels',
      type: 'symbol',
      source: 'locations',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#555',
        'text-halo-color': '#fff',
        'text-halo-width': 1,
      },
    })

    // Scissor (bisect) tool layers
    map.addSource('scissor-line', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer({
      id: 'scissor-line-layer',
      type: 'line',
      source: 'scissor-line',
      paint: {
        'line-color': '#8b5cf6',
        'line-width': 3,
        'line-dasharray': [4, 3],
        'line-opacity': 0.8,
      },
    })

    // Arrow from start (colder/blue) to end (hotter/red)
    map.addSource('scissor-arrow', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer({
      id: 'scissor-arrow-layer',
      type: 'line',
      source: 'scissor-arrow',
      paint: {
        'line-color': '#7c3aed',
        'line-width': 2.5,
        'line-opacity': 0.9,
      },
    })

    // Hot/cold half-plane overlays
    map.addSource('scissor-hot-side', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addSource('scissor-cold-side', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer(
      {
        id: 'scissor-hot-fill',
        type: 'fill',
        source: 'scissor-hot-side',
        paint: { 'fill-color': '#dc2626', 'fill-opacity': 0.08 },
      },
      'stations-layer',
    )
    map.addLayer(
      {
        id: 'scissor-cold-fill',
        type: 'fill',
        source: 'scissor-cold-side',
        paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.08 },
      },
      'stations-layer',
    )

    for (const layer of ['stations-layer', 'favorites-layer']) {
      map.on('click', layer, (e) => {
        const name = e.features?.[0]?.properties?.name
        if (name) openPopup(name, e.lngLat)
      })
      map.on('mouseenter', layer, () => {
        if (map) map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layer, () => {
        if (map) map.getCanvas().style.cursor = ''
      })
    }

    syncMapLayers()

    map.on('click', (e) => handleMapClick(e))

    // Keep bisect line edge-to-edge and handle at correct px offset on pan/zoom
    map.on('moveend', () => {
      if (scissorMode.value && scissorCenter.value) updateScissorVisuals()
    })

    // Auto-open bisect if URL has ?bisect= param
    if (new URLSearchParams(window.location.search).has('bisect')) {
      scissorMode.value = true
    }
  })
})

onUnmounted(() => {
  popup?.remove()
  scissorHandle?.remove()
  scissorCenterMarker?.remove()
  scissorEndpointA?.remove()
  scissorEndpointB?.remove()
  hotterMarker?.remove()
  colderMarker?.remove()
  arrowHeadA?.remove()
  arrowHeadB?.remove()
  gpsMarker?.remove()
  if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId)
  map?.remove()
  map = null
})

watch(
  [
    () => ({ ...store.crossedOff }),
    () => [...store.favorites],
    () => store.filteredStations.value,
    hideCrossedOff,
  ],
  () => {
    ;(map?.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
    ;(map?.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(
      buildFavGeoJSON(),
    )
    refreshPopup()
  },
)

watch(() => ({ ...store.mapLayers }), syncMapLayers)

watch(
  () => store.showStationLabels,
  (visible) => {
    if (!map) return
    map.setLayoutProperty('station-labels', 'visibility', visible ? 'visible' : 'none')
  },
)

watch(radiusMeters, () => {
  if (!radiusCenter.value) return
  updateRadiusCircle()
  ;(map?.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
  ;(map?.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(buildFavGeoJSON())
})

watch([scissorAngle, scissorDistance], () => {
  if (!scissorCenter.value) return
  updateScissorLayers()
})

watch(scissorMode, (active) => {
  if (active) {
    // Priority: URL param > localStorage > GPS-based default
    if (!loadBisectFromUrl() && !loadSavedBisect()) {
      scissorCenter.value = getDefaultBisectCenter()
      scissorAngle.value = 90
      scissorDistance.value = 500
    }
    if (!scissorLocked.value) determineStartEndFromGps()
    updateScissorVisuals()
  }
})

watch(showLocations, (visible) => {
  if (!map) return
  const v = visible ? 'visible' : 'none'
  map.setLayoutProperty('locations-layer', 'visibility', v)
  map.setLayoutProperty('locations-labels', 'visibility', v)
})
</script>

<template>
  <div class="map-wrapper">
    <div ref="mapEl" class="map-container" />

    <div class="map-controls">
      <button
        :class="['toggle-btn', { active: hideCrossedOff }]"
        @click="hideCrossedOff = !hideCrossedOff"
      >
        {{ hideCrossedOff ? 'Show all' : 'Hide marked off' }}
      </button>
      <button
        :class="['toggle-btn', { active: showLocations }]"
        @click="showLocations = !showLocations"
      >
        📍 Places
      </button>
      <button :class="['toggle-btn', { active: radiusMode }]" @click="radiusMode = !radiusMode">
        📍 Radius
      </button>
      <button
        :class="['toggle-btn', { active: scissorMode }]"
        @click="scissorMode ? clearScissor() : (scissorMode = true)"
      >
        ✂️ Bisect
      </button>
    </div>

    <div v-if="radiusMode" class="radius-panel">
      <div class="radius-label">
        {{ radiusMeters >= 1000 ? `${(radiusMeters / 1000).toFixed(1)} km` : `${radiusMeters} m` }}
        <span v-if="stationsInRadius.size > 0" class="radius-count">
          · {{ radiusInsideCount }} stations
        </span>
      </div>
      <input
        v-model.number="radiusMeters"
        type="range"
        :min="100"
        :max="30000"
        :step="100"
        class="radius-slider"
      />
      <div class="radius-hint">
        {{ radiusCenter ? 'Tap map to move center' : 'Tap map to place circle' }}
        <button v-if="radiusCenter" class="radius-clear" @click="clearRadius">Clear</button>
      </div>
      <div v-if="radiusCenter && stationsInRadius.size > 0" class="radius-actions">
        <button class="radius-action-btn" @click="crossOffInRadius">
          Mark off inside ({{ radiusInsideCount }})
        </button>
        <button class="radius-action-btn" @click="crossOffOutsideRadius">
          Mark off outside ({{ radiusOutsideCount }})
        </button>
      </div>
    </div>

    <div v-if="scissorMode" class="scissor-panel">
      <div class="scissor-label">
        ✂️ Bisect Tool
        <span v-if="scissorLocked" class="scissor-distance-label"> · shared view</span>
        <span v-else-if="scissorCenter" class="scissor-distance-label">
          ·
          {{
            scissorDistance >= 1000
              ? `${(scissorDistance / 1000).toFixed(1)} km`
              : `${scissorDistance} m`
          }}
          apart · {{ scissorMarkOffCount }} remaining
        </span>
      </div>
      <div v-if="!scissorLocked" class="scissor-controls">
        <label class="scissor-field">
          <span>Distance between endpoints</span>
          <select v-model.number="scissorDistance" class="scissor-select">
            <option v-for="d in SCISSOR_DISTANCES" :key="d" :value="d">
              {{ d >= 1000 ? `${d / 1000} km` : `${d} m` }}
            </option>
          </select>
        </label>
      </div>
      <div v-if="!scissorLocked" class="scissor-hint">
        {{ scissorCenter ? 'Drag ↻ handle to rotate' : 'Tap map to place center point' }}
      </div>
      <div v-if="scissorCenter" class="scissor-actions">
        <button class="scissor-cancel-btn" @click="clearScissor">Cancel</button>
        <template v-if="!scissorLocked">
          <button class="scissor-flip-btn" @click="reverseEndpoints">⟳ Reverse</button>
          <button class="scissor-share-btn" @click="shareBisect">🔗 Share</button>
          <button
            v-if="scissorMarkOffCount > 0"
            class="scissor-markoff-btn"
            @click="markOffScissorSide"
          >
            Mark off {{ scissorMarkOffCount }}
          </button>
        </template>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showReasonModal" class="overlay" @click.self="cancelMapCrossOff">
        <div class="modal">
          <p class="modal-text">Mark off {{ pendingCrossOff }}?</p>
          <input
            v-model="reasonText"
            type="text"
            class="reason-input"
            placeholder="Reason (e.g. visited, closed…)"
            @keyup.enter="confirmMapCrossOff"
          />
          <div class="modal-buttons">
            <button class="modal-btn cancel-btn" @click="cancelMapCrossOff">Cancel</button>
            <button class="modal-btn confirm-btn" @click="confirmMapCrossOff">Mark off</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  position: absolute;
  inset: 0;
}

.map-controls {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 10;
}

.toggle-btn {
  padding: 8px 16px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
}

.toggle-btn.active {
  background: #0066cc;
  color: #fff;
  border-color: #0066cc;
}

.radius-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 60px;
  background: #fff;
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.radius-label {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}

.radius-count {
  font-weight: 400;
  color: #f59e0b;
}

.radius-slider {
  width: 100%;
  accent-color: #f59e0b;
}

.radius-hint {
  font-size: 12px;
  color: #888;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.radius-clear {
  padding: 3px 10px;
  font-size: 12px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.radius-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.radius-action-btn {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  background: #e44;
  color: #fff;
  cursor: pointer;
}

.scissor-panel {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 60px;
  background: #fff;
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.scissor-label {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}

.scissor-distance-label {
  font-weight: 400;
  color: #8b5cf6;
}

.scissor-controls {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.scissor-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #666;
  flex: 1;
  min-width: 100px;
}

.scissor-select {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
}

.scissor-hint {
  font-size: 12px;
  color: #888;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}

.scissor-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.scissor-cancel-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #f0f0f0;
  color: #333;
  cursor: pointer;
}

.scissor-flip-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #8b5cf6;
  border-radius: 6px;
  background: #f5f3ff;
  color: #8b5cf6;
  cursor: pointer;
}

.scissor-share-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #0066cc;
  border-radius: 6px;
  background: #eff6ff;
  color: #0066cc;
  cursor: pointer;
}

.scissor-markoff-btn {
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid #dc2626;
  border-radius: 6px;
  background: #fff;
  color: #dc2626;
  cursor: pointer;
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  width: min(320px, 90vw);
  text-align: center;
}

.modal-text {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
}

.reason-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 16px;
}

.modal-buttons {
  display: flex;
  gap: 12px;
}

.modal-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.cancel-btn {
  background: #f0f0f0;
  color: #333;
}

.confirm-btn {
  background: #e44;
  color: #fff;
}
</style>

<style>
.map-popup {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 4px 2px;
}

.maplibregl-popup-close-button {
  font-size: 24px;
  width: 36px;
  height: 36px;
  line-height: 36px;
  text-align: center;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

.map-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.map-popup-name {
  font-size: 15px;
  font-weight: 700;
}

.map-popup-fav {
  background: none;
  border: none;
  font-size: 18px;
  color: #ccc;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}

.map-popup-fav.active {
  color: #f59e0b;
}

.map-popup-lines {
  font-size: 12px;
  color: #666;
  margin-bottom: 10px;
}

.map-popup-reason {
  font-size: 12px;
  color: #e44;
  margin-bottom: 8px;
  font-style: italic;
}

.map-popup-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
  margin-bottom: 8px;
}

.map-popup-check input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: #0066cc;
  cursor: pointer;
}

.map-popup-link {
  display: block;
  font-size: 13px;
  color: #0066cc;
  text-decoration: none;
}

.map-popup-link:hover {
  text-decoration: underline;
}
</style>
