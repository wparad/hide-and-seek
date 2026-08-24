<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  useStore,
  type MapLayerVisibility,
  type ToolEntry,
  type BisectHistoryParams,
  type RadiusHistoryParams,
  type EndgameHistoryParams,
  type DistanceHistoryParams,
} from '../store'
import { stations, locations, buildGeoLines } from '../stations'
import { userPosition } from '../gps'
import { showToast } from '../toast'

const store = useStore()
const mapEl = ref<HTMLDivElement | null>(null)
const rulerCanvas = ref<HTMLCanvasElement | null>(null)
const hideCrossedOff = ref(false)
const showLocations = ref(true)
const menuOpen = ref(false)
const showHistory = ref(false)
const stationSearch = ref('')
const hideNonMatching = ref(false)
const hideTrainLines = ref(false)

function normalizeSearch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const searchMatchingStations = computed(() => {
  const q = normalizeSearch(stationSearch.value)
  if (!q) return new Set<string>()
  return new Set(stations.filter((s) => normalizeSearch(s.name).includes(q)).map((s) => s.name))
})

let map: maplibregl.Map | null = null
let popup: maplibregl.Popup | null = null
let popupStation: string | null = null

const pendingCrossOff = ref('')
const showReasonModal = ref(false)
const reasonText = ref('')

// Radius tool state
const radiusMode = ref(false)
const radiusLocked = ref(false) // true when loaded from URL — read-only preview until Applied
const radiusMeters = ref(5000)
const radiusCenter = ref<[number, number] | null>(null)
const stationsInRadius = ref<Set<string>>(new Set())
// Undo-capable apply toggle per side — reset whenever the circle's position/size changes (see
// resetRadiusToolIds call sites).
const radiusInsideToolId = ref<string | null>(null)
const radiusOutsideToolId = ref<string | null>(null)
const radiusInsideMarked = computed(
  () => radiusInsideToolId.value !== null && store.isToolEnabled(radiusInsideToolId.value),
)
const radiusOutsideMarked = computed(
  () => radiusOutsideToolId.value !== null && store.isToolEnabled(radiusOutsideToolId.value),
)

// Scissor (bisect) tool state
const scissorMode = ref(false)
const scissorLocked = ref(false) // true when loaded from URL — read-only preview until Applied
const scissorStart = ref<[number, number] | null>(null) // tapped/dragged start point (cold/blue)
const scissorAngle = ref(90) // degrees, direction from start toward the end point
const scissorDistance = ref(500) // meters — fixed start→end distance
const scissorFlipped = ref(false)
const SCISSOR_DISTANCES = [500, 1000, 2000, 3000, 4000, 5000, 15000]
const stationsOnScissorSide = ref<Set<string>>(new Set())
// Colour every station by which side of the bisect it's on:
// 'hot' (toward the end/red endpoint — will be/was marked off) or 'cold' (toward start/green — stays).
const scissorStationSide = ref<Map<string, 'hot' | 'cold'>>(new Map())
const scissorHotStations = computed(() =>
  [...stationsOnScissorSide.value].filter((n) => !(n in store.crossedOff)),
)
const scissorColdStations = computed(() =>
  stations
    .map((s) => s.name)
    .filter(
      (n) => !stationsOnScissorSide.value.has(n) && scissorStart.value && !(n in store.crossedOff),
    ),
)
// Undo-capable mark toggle per side — reset whenever a genuinely new bisect starts (see
// resetScissorToolIds call sites).
const scissorHotToolId = ref<string | null>(null)
const scissorColdToolId = ref<string | null>(null)
const scissorHotMarked = computed(
  () => scissorHotToolId.value !== null && store.isToolEnabled(scissorHotToolId.value),
)
const scissorColdMarked = computed(
  () => scissorColdToolId.value !== null && store.isToolEnabled(scissorColdToolId.value),
)
const radiusInsideCount = computed(
  () => [...stationsInRadius.value].filter((n) => !(n in store.crossedOff)).length,
)
const radiusOutsideCount = computed(
  () =>
    stations.filter((s) => !stationsInRadius.value.has(s.name) && !(s.name in store.crossedOff))
      .length,
)
let scissorEndpointA: maplibregl.Marker | null = null // hot/red — indicator only
let scissorEndpointB: maplibregl.Marker | null = null // cold/blue — start point indicator only
let scissorHandle: maplibregl.Marker | null = null // separate, large drag handle on the bisect line
let arrowHeadA: maplibregl.Marker | null = null
let arrowHeadB: maplibregl.Marker | null = null
let hotterMarker: maplibregl.Marker | null = null
let colderMarker: maplibregl.Marker | null = null
let radiusCenterMarker: maplibregl.Marker | null = null
// Fixed px offset from center along the bisect line — deliberately far from the endpoint so the
// handle never overlaps the endpoint's coordinate display, and large enough to grab easily.
const HANDLE_OFFSET_PX = 110

// Share popup (bisect/radius) state
const shareModalKind = ref<'bisect' | 'radius' | null>(null)

// Distance tool state
const distanceMode = ref(false)
const distancePointA = ref<[number, number] | null>(null)
const distancePointB = ref<[number, number] | null>(null)
let distanceMarkerA: maplibregl.Marker | null = null
let distanceMarkerB: maplibregl.Marker | null = null
const distanceMarkings = computed(() =>
  store.tools.filter(
    (t): t is ToolEntry & { params: DistanceHistoryParams } => t.type === 'distance' && t.enabled,
  ),
)

// GPS location state
let gpsMarker: maplibregl.Marker | null = null

const LAYER_GROUPS: Partial<Record<keyof MapLayerVisibility, RegExp>> = {
  roads:
    /^(tunnel_(motorway|service|link|street|minor|secondary|tertiary|trunk|primary|path)|road_(area|motorway|service|link|minor|secondary|tertiary|trunk|primary|path|one_way)|bridge_(motorway|service|link|street|path|secondary|tertiary|trunk|primary)|highway-shield|road_shield)/,
  rail: /^(tunnel_(major_rail|transit_rail)|road_(major_rail|transit_rail)|bridge_(major_rail|transit_rail))/,
  // label_state = canton names, label_country_1/2/3 = country names — carved out into their own
  // `regionLabels` group below so they can be shown independently of every other label type.
  labels: /^(label_(?!state|country_)|waterway_line_label|water_name_|highway-name)/,
  regionLabels: /^label_(state|country_)/,
  buildings: /^building/,
  poi: /^(poi_|airport)/,
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
        if (group === 'regionLabels') {
          // The base style hides canton/country names above zoom 8/9 (meant for whole-country
          // views), but this app opens at zoom 10 on a Zurich-area city view — extend the range
          // so the toggle actually has an effect at the zoom levels this app is used at.
          map.setLayerZoomRange(layer.id, 0, 24)
        }
        break
      }
    }
  }
}

function openPopup(name: string, lngLat: maplibregl.LngLatLike) {
  if (!map) return
  popupStation = name
  popup?.remove()
  popup = new maplibregl.Popup({ closeButton: true, maxWidth: '320px' })
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
  const reason = store.getCrossOffReason(name)
  const reasonHtml =
    crossed && reason ? `<div class="map-popup-reason">Reason: ${reason}</div>` : ''
  return `
    <div class="map-popup">
      <div class="map-popup-header">
        <div class="map-popup-name">${name}</div>
        <button class="map-popup-fav${fav ? ' active' : ''}" data-action="favorite">${fav ? '★ Fav' : '☆ Fav'}</button>
      </div>
      <div class="map-popup-lines">${linesText}</div>
      ${reasonHtml}
      <label class="map-popup-check">
        <input type="checkbox" data-action="toggle" ${crossed ? '' : 'checked'} />
        <span>${crossed ? 'Marked off' : 'Available'}</span>
      </label>
      <div class="map-popup-actions">
        <a class="map-popup-endgame" href="?endgame=${encodeURIComponent(name)}" data-action="endgame">🎯 Endgame</a>
      </div>
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
  if (target.dataset.action === 'favorite' && popupStation) {
    store.toggleFavorite(popupStation)
    refreshPopup()
  }
  if (target.dataset.action === 'endgame' && popupStation) {
    e.preventDefault()
    // Update URL so it's shareable / navigable
    const url = new URL(window.location.href)
    url.searchParams.set('endgame', popupStation)
    history.pushState(null, '', url)
    // Save the selected station to endgame localStorage and reset map position
    const endgameState = JSON.parse(localStorage.getItem('hide-and-seek-endgame') ?? '{}')
    endgameState.station = popupStation
    endgameState.center = null
    endgameState.zoom = 0
    localStorage.setItem('hide-and-seek-endgame', JSON.stringify(endgameState))
    store.setTab('endgame')
  }
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
    updateRadiusCenterMarker()
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
  updateRadiusCenterMarker()
}

function createRadiusCenterEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText =
    'width:20px;height:20px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:grab;touch-action:none;'
  return el
}

function onRadiusCenterDrag() {
  if (!radiusCenterMarker) return
  const { lng, lat } = radiusCenterMarker.getLngLat()
  radiusCenter.value = [lng, lat]
  resetRadiusToolIds()
  updateRadiusCircle()
  ;(map?.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
  ;(map?.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(buildFavGeoJSON())
}

function updateRadiusCenterMarker() {
  if (!map) return
  if (!radiusCenter.value || radiusLocked.value) {
    radiusCenterMarker?.remove()
    radiusCenterMarker = null
    return
  }
  if (!radiusCenterMarker) {
    radiusCenterMarker = new maplibregl.Marker({
      element: createRadiusCenterEl(),
      draggable: true,
    })
      .setLngLat(radiusCenter.value)
      .addTo(map)
    radiusCenterMarker.on('drag', onRadiusCenterDrag)
  } else {
    radiusCenterMarker.setLngLat(radiusCenter.value)
  }
}

function handleMapClick(e: maplibregl.MapMouseEvent) {
  // While a tool is actively placing, snap taps to the exact coordinates of a tapped station
  // instead of the raw click lng/lat.
  const toolPlacing =
    (scissorMode.value && !scissorLocked.value) ||
    (radiusMode.value && !radiusLocked.value) ||
    distanceMode.value
  let point: [number, number] = [e.lngLat.lng, e.lngLat.lat]
  if (toolPlacing && map) {
    const feats = map.queryRenderedFeatures(e.point, {
      layers: ['stations-layer', 'favorites-layer'],
    })
    const name = feats[0]?.properties?.name as string | undefined
    const snapped = name ? stations.find((s) => s.name === name) : undefined
    if (snapped) point = snapped.coordinates
  }

  if (distanceMode.value) {
    // A 3rd tap after both points are set starts a fresh pair — the prior in-progress pair was
    // never added, so nothing is lost.
    if (!distancePointA.value || (distancePointA.value && distancePointB.value)) {
      distancePointA.value = point
      distancePointB.value = null
    } else {
      distancePointB.value = point
    }
    updateDistanceMarkers()
    updateDistanceLine()
    return
  }

  if (scissorMode.value) {
    // Locked bisect: geometry is frozen, so taps don't move the start point — the rest of the map stays usable.
    if (!scissorLocked.value) {
      scissorStart.value = point
      resetScissorToolIds()
      updateScissorLayers()
    }
    return
  }
  if (!radiusMode.value || radiusLocked.value) return
  radiusCenter.value = point
  resetRadiusToolIds()
  updateRadiusCircle()
  // Refresh station layers to show golden hue
  ;(map?.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
  ;(map?.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(buildFavGeoJSON())
}

function resetRadiusToolIds() {
  radiusInsideToolId.value = null
  radiusOutsideToolId.value = null
}

function clearRadius() {
  clearRadiusUrlParam()
  radiusCenter.value = null
  radiusMode.value = false
  radiusLocked.value = false
  stationsInRadius.value = new Set()
  resetRadiusToolIds()
  updateRadiusCircle()
  ;(map?.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
  ;(map?.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(buildFavGeoJSON())
}

function radiusDescription(): string {
  const km =
    radiusMeters.value >= 1000
      ? `${(radiusMeters.value / 1000).toFixed(1)}km`
      : `${radiusMeters.value}m`
  return `${km} radius`
}

// Applying a shared/locked radius (Apply) works the same as applying your own — this also
// auto-unlocks and hands the recipient a fully-editable local copy.
function unlockAfterApply() {
  if (radiusLocked.value) {
    radiusLocked.value = false
    clearRadiusUrlParam()
    updateRadiusCircle()
  }
}

// Toggles the "inside" application on/off, undoing it by disabling the tool history entry it
// created rather than deleting station history piecemeal.
function toggleRadiusInside() {
  if (radiusInsideToolId.value) {
    store.toggleTool(radiusInsideToolId.value)
    return
  }
  const names = [...stationsInRadius.value].filter((n) => !(n in store.crossedOff))
  if (names.length === 0) return
  radiusInsideToolId.value = store.addTool('radius', `Inside ${radiusDescription()}`, names, {
    reason: `Inside ${radiusDescription()}`,
    params: { center: radiusCenter.value!, meters: radiusMeters.value },
  })
  unlockAfterApply()
}

function toggleRadiusOutside() {
  if (radiusOutsideToolId.value) {
    store.toggleTool(radiusOutsideToolId.value)
    return
  }
  const names = stations
    .filter((s) => !stationsInRadius.value.has(s.name) && !(s.name in store.crossedOff))
    .map((s) => s.name)
  if (names.length === 0) return
  radiusOutsideToolId.value = store.addTool('radius', `Outside ${radiusDescription()}`, names, {
    reason: `Outside ${radiusDescription()}`,
    params: { center: radiusCenter.value!, meters: radiusMeters.value },
  })
  unlockAfterApply()
}

function buildRadiusShareUrl(): string | null {
  if (!radiusCenter.value) return null
  const [lng, lat] = radiusCenter.value
  const url = new URL(window.location.href)
  // A single-geometry share carries only this radius — not the map's whole tool history, not
  // endgame's separate state.
  url.searchParams.delete('t')
  url.searchParams.delete('c')
  url.searchParams.delete('endgame')
  url.searchParams.delete('radiusKm')
  url.searchParams.delete('zones')
  url.searchParams.set('radius', `${lng.toFixed(6)},${lat.toFixed(6)},${radiusMeters.value}`)
  return url.toString()
}

function loadRadiusFromUrl(): boolean {
  const param = new URLSearchParams(window.location.search).get('radius')
  if (!param) return false
  const parts = param.split(',').map(Number)
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return false
  radiusCenter.value = [parts[0], parts[1]]
  radiusMeters.value = parts[2]
  radiusLocked.value = true
  return true
}

function clearRadiusUrlParam() {
  const url = new URL(window.location.href)
  if (url.searchParams.has('radius')) {
    url.searchParams.delete('radius')
    history.replaceState(null, '', url)
  }
}

function toggleRadiusLock() {
  radiusLocked.value = !radiusLocked.value
  if (!radiusLocked.value) clearRadiusUrlParam()
  updateRadiusCircle()
}

// Distance tool: place point A then point B, straight-line distance between them. Each finalized
// pair becomes its own 'distance' tool entry (stations: [] — it never crosses anything off) so
// several can coexist, all drawn at once, each independently toggleable from history.
function createDistancePointEl(color: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:grab;touch-action:none;`
  return el
}

function onDistancePointADrag() {
  if (!distanceMarkerA) return
  const { lng, lat } = distanceMarkerA.getLngLat()
  distancePointA.value = [lng, lat]
  updateDistanceLine()
}

function onDistancePointBDrag() {
  if (!distanceMarkerB) return
  const { lng, lat } = distanceMarkerB.getLngLat()
  distancePointB.value = [lng, lat]
  updateDistanceLine()
}

function updateDistanceMarkers() {
  if (!map) return
  if (distancePointA.value) {
    if (!distanceMarkerA) {
      distanceMarkerA = new maplibregl.Marker({
        element: createDistancePointEl('#7c3aed'),
        draggable: true,
      })
        .setLngLat(distancePointA.value)
        .addTo(map)
      distanceMarkerA.on('drag', onDistancePointADrag)
    } else {
      distanceMarkerA.setLngLat(distancePointA.value)
    }
  } else {
    distanceMarkerA?.remove()
    distanceMarkerA = null
  }

  if (distancePointB.value) {
    if (!distanceMarkerB) {
      distanceMarkerB = new maplibregl.Marker({
        element: createDistancePointEl('#a855f7'),
        draggable: true,
      })
        .setLngLat(distancePointB.value)
        .addTo(map)
      distanceMarkerB.on('drag', onDistancePointBDrag)
    } else {
      distanceMarkerB.setLngLat(distancePointB.value)
    }
  } else {
    distanceMarkerB?.remove()
    distanceMarkerB = null
  }
}

function updateDistanceLine() {
  const source = map?.getSource('distance-line') as maplibregl.GeoJSONSource | undefined
  if (!source) return
  if (!distancePointA.value || !distancePointB.value) {
    source.setData({ type: 'FeatureCollection', features: [] })
    return
  }
  source.setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [distancePointA.value, distancePointB.value],
        },
        properties: {},
      },
    ],
  })
}

function updateDistanceMarkingsLayer() {
  const source = map?.getSource('distance-markings') as maplibregl.GeoJSONSource | undefined
  if (!source) return
  source.setData({
    type: 'FeatureCollection',
    features: distanceMarkings.value.map((m) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [m.params.pointA, m.params.pointB],
      },
      properties: { id: m.id },
    })),
  })
}

const distancePreviewMeters = computed(() => {
  if (!distancePointA.value || !distancePointB.value) return null
  return haversineMeters(distancePointA.value, distancePointB.value)
})

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`
}

function addDistanceMarking() {
  if (!distancePointA.value || !distancePointB.value) return
  const meters = haversineMeters(distancePointA.value, distancePointB.value)
  store.addTool('distance', `Distance · ${formatDistance(meters)}`, [], {
    params: { pointA: distancePointA.value, pointB: distancePointB.value },
  })
  distancePointA.value = null
  distancePointB.value = null
  updateDistanceMarkers()
  updateDistanceLine()
}

function cancelDistancePlacement() {
  distancePointA.value = null
  distancePointB.value = null
  updateDistanceMarkers()
  updateDistanceLine()
}

function clearDistanceMode() {
  distanceMode.value = false
  cancelDistancePlacement()
}

// Scissor tool: endpoints[0] = end (hot/red), endpoints[1] = start (cold/blue) — fixed convention
// preserved from the old center-based model so downstream indexing doesn't need to change.
function getScissorEndpoints(): [[number, number], [number, number]] | null {
  if (!scissorStart.value) return null
  const angleRad = (scissorAngle.value * Math.PI) / 180
  const [sLng, sLat] = scissorStart.value
  const dLngPerM = 1 / (111320 * Math.cos((sLat * Math.PI) / 180))
  const dLatPerM = 1 / 110574
  const end: [number, number] = [
    sLng + scissorDistance.value * Math.cos(angleRad) * dLngPerM,
    sLat + scissorDistance.value * Math.sin(angleRad) * dLatPerM,
  ]
  return [end, scissorStart.value]
}

// Derived pivot for the perpendicular bisect line/overlays — the midpoint of start and end.
const scissorCenter = computed<[number, number] | null>(() => {
  const endpoints = getScissorEndpoints()
  if (!endpoints) return null
  const [[eLng, eLat], [sLng, sLat]] = endpoints
  return [(eLng + sLng) / 2, (eLat + sLat) / 2]
})

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

function createEndpointEl(color: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};opacity:0.9;pointer-events:none;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);`
  return el
}

// The standalone drag handle that sets the bisect angle — deliberately not the endpoint marker
// itself (see HANDLE_OFFSET_PX), so it can be big and grabbable without overlapping the
// endpoint's own coordinate display.
function createHandleEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText =
    'width:44px;height:44px;border-radius:50%;background:#8b5cf6;display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;cursor:grab;touch-action:none;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.35);user-select:none;'
  el.textContent = '↻'
  return el
}

function createLabelEl(text: string, color: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `font-size:18px;font-weight:900;color:${color};text-shadow:0 0 4px #fff,0 0 4px #fff;pointer-events:none;user-select:none;`
  el.textContent = text
  return el
}

// Handle sits on the bisect line itself (perpendicular to the endpoint axis) at a fixed px
// offset from center, same convention as the pre-overhaul model.
function getHandleLngLat(): [number, number] | null {
  if (!scissorCenter.value || !map) return null
  const centerPx = map.project(scissorCenter.value as maplibregl.LngLatLike)
  const perpAngleRad = ((scissorAngle.value + 90) * Math.PI) / 180
  const handlePx: [number, number] = [
    centerPx.x + HANDLE_OFFSET_PX * Math.cos(perpAngleRad),
    centerPx.y - HANDLE_OFFSET_PX * Math.sin(perpAngleRad),
  ]
  const lngLat = map.unproject(handlePx)
  return [lngLat.lng, lngLat.lat]
}

function onScissorHandleDrag() {
  if (!scissorCenter.value || !scissorHandle || !map) return
  const centerPx = map.project(scissorCenter.value as maplibregl.LngLatLike)
  const handlePx = map.project(scissorHandle.getLngLat())
  const dx = handlePx.x - centerPx.x
  const dy = -(handlePx.y - centerPx.y) // invert Y for math coords
  const lineAngle = (Math.atan2(dy, dx) * 180) / Math.PI
  // The handle sits on the bisect line, which is perpendicular to the endpoint axis.
  scissorAngle.value = (Math.round(lineAngle - 90) + 360) % 360
  updateScissorVisuals()
}

function updateHotColdLabels() {
  if (!map || !scissorCenter.value || scissorLocked.value) {
    hotterMarker?.remove()
    colderMarker?.remove()
    hotterMarker = null
    colderMarker = null
    return
  }
  const centerPx = map.project(scissorCenter.value as maplibregl.LngLatLike)
  const angleRad = (scissorAngle.value * Math.PI) / 180
  const labelOffset = 120
  const hotPx: [number, number] = [
    centerPx.x + labelOffset * Math.cos(angleRad),
    centerPx.y - labelOffset * Math.sin(angleRad),
  ]
  const coldPx: [number, number] = [
    centerPx.x - labelOffset * Math.cos(angleRad),
    centerPx.y + labelOffset * Math.sin(angleRad),
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

function updateScissorMarkers() {
  if (!map) return

  if (!scissorStart.value) {
    scissorEndpointA?.remove()
    scissorEndpointB?.remove()
    scissorHandle?.remove()
    scissorEndpointA = null
    scissorEndpointB = null
    scissorHandle = null
    return
  }

  // Endpoint indicators. Fixed convention: endpoints[0] = end (hot/red, will be marked off),
  // endpoints[1] = start (cold/blue, stays). Reverse swaps which physical point is which.
  // Neither is draggable — the standalone handle (below) is what sets the angle.
  const endpoints = getScissorEndpoints()
  if (endpoints) {
    const endColor = '#dc2626'
    const startColor = '#2563eb'

    if (!scissorEndpointA) {
      scissorEndpointA = new maplibregl.Marker({ element: createEndpointEl(endColor) })
        .setLngLat(endpoints[0])
        .addTo(map)
    } else {
      scissorEndpointA.setLngLat(endpoints[0])
    }

    // Standalone drag handle on the bisect line — hidden in locked/shared view.
    if (!scissorLocked.value) {
      const handlePos = getHandleLngLat()
      if (handlePos) {
        if (!scissorHandle) {
          scissorHandle = new maplibregl.Marker({
            element: createHandleEl(),
            draggable: true,
          })
            .setLngLat(handlePos)
            .addTo(map)
          scissorHandle.on('drag', onScissorHandleDrag)
        } else {
          scissorHandle.setLngLat(handlePos)
        }
      }
    } else {
      scissorHandle?.remove()
      scissorHandle = null
    }

    if (!scissorEndpointB) {
      scissorEndpointB = new maplibregl.Marker({ element: createEndpointEl(startColor) })
        .setLngLat(endpoints[1])
        .addTo(map)
    } else {
      scissorEndpointB.setLngLat(endpoints[1])
    }

    // Arrow line from start → end
    const startIdx = 1
    const endIdx = 0
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

  // Hot side: extend from line toward the end endpoint (+angle direction)
  const hotOffset: [number, number] = [ext * Math.cos(angleRad), -ext * Math.sin(angleRad)]
  const coldOffset: [number, number] = [-ext * Math.cos(angleRad), ext * Math.sin(angleRad)]

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

// Sign-corrected: both the "will be marked off" set and the hot/cold map respect scissorFlipped,
// so locked-view coloring can never disagree with what mark-off would actually do.
function computeScissorSide() {
  const sideMap = new Map<string, 'hot' | 'cold'>()
  if (scissorStart.value && scissorCenter.value && map) {
    // Use screen-space math to match the visual bisect line
    const centerPx = map.project(scissorCenter.value as maplibregl.LngLatLike)
    // Normal to the bisect line in screen space (endpoint axis direction)
    const angleRad = (scissorAngle.value * Math.PI) / 180
    const nx = Math.cos(angleRad)
    const ny = -Math.sin(angleRad) // negate Y because screen Y is inverted
    const sign = scissorFlipped.value ? -1 : 1
    // Hot is toward the end endpoint (+normal direction).
    for (const s of stations) {
      const sPx = map.project(s.coordinates as maplibregl.LngLatLike)
      const dx = sPx.x - centerPx.x
      const dy = sPx.y - centerPx.y
      const proj = (dx * nx + dy * ny) * sign
      sideMap.set(s.name, proj > 0 ? 'hot' : 'cold')
    }
  }
  scissorStationSide.value = sideMap
  stationsOnScissorSide.value = new Set(
    [...sideMap].filter(([, side]) => side === 'hot').map(([name]) => name),
  )
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

// Also serves as the "Apply" action for a shared/locked bisect (see toolHistory + Apply flow) —
// works unchanged whether scissorLocked is true or false since it only reads
// stationsOnScissorSide/store.crossedOff.
function bisectParams(): BisectHistoryParams | null {
  if (!scissorStart.value) return null
  return { start: scissorStart.value, angle: scissorAngle.value, distance: scissorDistance.value }
}

// Toggles marking the hot (red) side off/on, undoing it by disabling the tool history entry it
// created — "Unmark" never deletes station history piecemeal.
function toggleMarkHotter() {
  if (scissorHotToolId.value) {
    store.toggleTool(scissorHotToolId.value)
    return
  }
  const names = scissorHotStations.value
  const params = bisectParams()
  if (names.length === 0 || !params) return
  scissorHotToolId.value = store.addTool('bisect', 'Bisect · hotter side', names, {
    reason: 'Bisect · hotter side',
    params,
  })
  if (scissorLocked.value) {
    scissorLocked.value = false
    clearBisectUrlParam()
    updateScissorVisuals()
  }
}

function toggleMarkColder() {
  if (scissorColdToolId.value) {
    store.toggleTool(scissorColdToolId.value)
    return
  }
  const names = scissorColdStations.value
  const params = bisectParams()
  if (names.length === 0 || !params) return
  scissorColdToolId.value = store.addTool('bisect', 'Bisect · colder side', names, {
    reason: 'Bisect · colder side',
    params,
  })
  if (scissorLocked.value) {
    scissorLocked.value = false
    clearBisectUrlParam()
    updateScissorVisuals()
  }
}

function resetScissorToolIds() {
  scissorHotToolId.value = null
  scissorColdToolId.value = null
}

const SCISSOR_STORAGE_KEY = 'hide-and-seek-bisect'

function saveBisect() {
  if (!scissorStart.value) return
  localStorage.setItem(
    SCISSOR_STORAGE_KEY,
    JSON.stringify({
      start: scissorStart.value,
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
    if (typeof data.angle !== 'number') return false
    if (typeof data.distance === 'number') scissorDistance.value = data.distance
    if (data.start) {
      scissorStart.value = data.start
      scissorAngle.value = data.angle
      return true
    }
    // Migrate legacy { center, angle, distance } shape: start = center − (distance/2)·dir(angle)
    if (data.center && typeof data.distance === 'number') {
      const angleRad = (data.angle * Math.PI) / 180
      const [cLng, cLat] = data.center as [number, number]
      const dLngPerM = 1 / (111320 * Math.cos((cLat * Math.PI) / 180))
      const dLatPerM = 1 / 110574
      const half = data.distance / 2
      scissorStart.value = [
        cLng - half * Math.cos(angleRad) * dLngPerM,
        cLat - half * Math.sin(angleRad) * dLatPerM,
      ]
      scissorAngle.value = data.angle
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
  scissorStart.value = [parts[0], parts[1]]
  scissorAngle.value = parts[2]
  scissorDistance.value = parts[3]
  scissorLocked.value = true
  return true
}

function getDefaultBisectStart(): [number, number] {
  // 250m left (west) of user GPS, or map center [8.55, 47.38]
  const base: [number, number] = userPosition.value ?? [8.55, 47.38]
  const offsetLng = -250 / (111320 * Math.cos((base[1] * Math.PI) / 180))
  return [base[0] + offsetLng, base[1]]
}

function buildBisectShareUrl(): string | null {
  if (!scissorStart.value) return null
  const [lng, lat] = scissorStart.value
  const url = new URL(window.location.href)
  // A single-geometry share carries only this bisect — not the map's whole tool history, not
  // endgame's separate state.
  url.searchParams.delete('t')
  url.searchParams.delete('c')
  url.searchParams.delete('endgame')
  url.searchParams.delete('radiusKm')
  url.searchParams.delete('zones')
  url.searchParams.set(
    'bisect',
    `${lng.toFixed(6)},${lat.toFixed(6)},${scissorAngle.value},${scissorDistance.value}`,
  )
  return url.toString()
}

// Remove the ?bisect= param so a shared/locked view isn't reasserted after unlocking or cancelling.
function clearBisectUrlParam() {
  const url = new URL(window.location.href)
  if (url.searchParams.has('bisect')) {
    url.searchParams.delete('bisect')
    history.replaceState(null, '', url)
  }
}

interface ShareModalPoint {
  label: string
  color: string
  coords: [number, number]
}

const shareModalPoints = computed<ShareModalPoint[]>(() => {
  if (shareModalKind.value === 'bisect') {
    const endpoints = getScissorEndpoints()
    if (!endpoints) return []
    return [
      { label: 'Start (colder)', color: '#2563eb', coords: endpoints[1] },
      { label: 'End (hotter)', color: '#dc2626', coords: endpoints[0] },
    ]
  }
  if (shareModalKind.value === 'radius') {
    if (!radiusCenter.value) return []
    return [{ label: 'Center', color: '#f59e0b', coords: radiusCenter.value }]
  }
  return []
})

function shareModalUrl(): string | null {
  if (shareModalKind.value === 'bisect') return buildBisectShareUrl()
  if (shareModalKind.value === 'radius') return buildRadiusShareUrl()
  return null
}

function copyShareModalUrl() {
  const url = shareModalUrl()
  if (!url) return
  navigator.clipboard.writeText(url)
  showToast('Share link copied', 'success')
}

function copySharePointCoords(point: ShareModalPoint) {
  const [lng, lat] = point.coords
  navigator.clipboard.writeText(`${lat.toFixed(6)},${lng.toFixed(6)}`)
  showToast('Coordinates copied', 'success')
}

// Swaps which physical point is start vs end: newStart = oldEnd, newAngle = angle + 180.
// midpoint(newStart, newEnd) == midpoint(oldStart, oldEnd), so the bisect line/center never
// moves — only which end is hot/cold flips. Does not reset the mark-off toggle (not "a new bisect").
function reverseEndpoints() {
  const endpoints = getScissorEndpoints()
  if (!endpoints || !scissorStart.value) return
  scissorStart.value = endpoints[0]
  scissorAngle.value = (scissorAngle.value + 180) % 360
  updateScissorVisuals()
}

// Switch between edit mode (draggable endpoint, controls, mark-off) and locked read-only
// shared view. updateScissorVisuals re-renders the endpoint and station colors.
function toggleScissorLock() {
  scissorLocked.value = !scissorLocked.value
  if (!scissorLocked.value) clearBisectUrlParam()
  updateScissorVisuals()
}

function determineStartEndFromGps() {
  if (!scissorStart.value || !userPosition.value) return
  const endpoints = getScissorEndpoints()
  if (!endpoints) return
  const distEnd = haversineMeters(userPosition.value, endpoints[0])
  const distStart = haversineMeters(userPosition.value, endpoints[1])
  // Nearest point to GPS should be start; if end is closer, swap them.
  if (distEnd < distStart) reverseEndpoints()
}

function updateGpsMarker() {
  if (!map || !userPosition.value) return
  if (!gpsMarker) {
    const el = document.createElement('div')
    el.style.cssText =
      'width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 6px rgba(59,130,246,0.6);pointer-events:none;'
    gpsMarker = new maplibregl.Marker({ element: el }).setLngLat(userPosition.value).addTo(map)
  } else {
    gpsMarker.setLngLat(userPosition.value)
  }
}

function clearScissor() {
  // Just hide UI — don't reset saved state
  clearBisectUrlParam()
  scissorEndpointA?.remove()
  scissorEndpointB?.remove()
  scissorHandle?.remove()
  arrowHeadA?.remove()
  arrowHeadB?.remove()
  hotterMarker?.remove()
  colderMarker?.remove()
  scissorEndpointA = null
  scissorEndpointB = null
  scissorHandle = null
  arrowHeadA = null
  arrowHeadB = null
  hotterMarker = null
  colderMarker = null
  scissorMode.value = false
  scissorLocked.value = false
  stationsOnScissorSide.value = new Set()
  resetScissorToolIds()
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

// Reload a past bisect/radius/endgame configuration onto the map, fully editable — this is also
// how a shared link's recipient can end up with the exact same tool history entry locally.
function loadToolHistoryEntry(entry: ToolEntry) {
  if (entry.type === 'bisect') {
    const params = entry.params as BisectHistoryParams
    // Route through the same localStorage key the tool already restores from on open, so a
    // freshly-opened bisect picks this exact geometry up via the existing loadSavedBisect() path.
    localStorage.setItem(
      SCISSOR_STORAGE_KEY,
      JSON.stringify({ start: params.start, angle: params.angle, distance: params.distance }),
    )
    scissorLocked.value = false
    if (scissorMode.value) {
      scissorStart.value = params.start
      scissorAngle.value = params.angle
      scissorDistance.value = params.distance
      resetScissorToolIds()
      updateScissorVisuals()
    } else {
      scissorMode.value = true
    }
  } else if (entry.type === 'radius') {
    const params = entry.params as RadiusHistoryParams
    radiusLocked.value = false
    radiusCenter.value = params.center
    radiusMeters.value = params.meters
    radiusMode.value = true
    resetRadiusToolIds()
    updateRadiusCircle()
    ;(map?.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
    ;(map?.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(
      buildFavGeoJSON(),
    )
  } else if (entry.type === 'endgame') {
    const params = entry.params as EndgameHistoryParams
    const url = new URL(window.location.href)
    url.searchParams.set('endgame', params.station)
    url.searchParams.set('radiusKm', String(params.radiusKm))
    if (params.zones.length > 0) {
      url.searchParams.set(
        'zones',
        params.zones
          .map(
            (z) =>
              `${z.center[0].toFixed(6)},${z.center[1].toFixed(6)},${z.radiusM},${z.inside ? 1 : 0}`,
          )
          .join(';'),
      )
    } else {
      url.searchParams.delete('zones')
    }
    history.replaceState(null, '', url)
    store.setTab('endgame')
  } else {
    return
  }
  showHistory.value = false
}

function buildGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations
      .filter((s) => !store.favorites.includes(s.name))
      .filter((s) => !(hideCrossedOff.value && stationStatus(s.name) === 'crossed-off'))
      .filter(
        (s) =>
          !(
            hideNonMatching.value &&
            stationSearch.value &&
            !searchMatchingStations.value.has(s.name)
          ),
      )
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: s.coordinates },
        properties: {
          name: s.name,
          status: stationStatus(s.name),
          inRadius: stationsInRadius.value.has(s.name) ? 'yes' : 'no',
          scissorSide: scissorStart.value
            ? (scissorStationSide.value.get(s.name) ?? 'none')
            : 'none',
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
      .filter(
        (s) =>
          !(
            hideNonMatching.value &&
            stationSearch.value &&
            !searchMatchingStations.value.has(s.name)
          ),
      )
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: s.coordinates },
        properties: {
          name: s.name,
          status: stationStatus(s.name),
          inRadius: stationsInRadius.value.has(s.name) ? 'yes' : 'no',
          scissorSide: scissorStart.value
            ? (scissorStationSide.value.get(s.name) ?? 'none')
            : 'none',
        },
      })),
  }
}

function buildSearchHighlightGeoJSON(): GeoJSON.FeatureCollection {
  if (searchMatchingStations.value.size === 0) {
    return { type: 'FeatureCollection', features: [] }
  }
  const features = stations
    .filter((s) => searchMatchingStations.value.has(s.name))
    .map((s) => {
      const points = 64
      const coords: [number, number][] = []
      const km = 0.5
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * 2 * Math.PI
        const dx = km * Math.cos(angle)
        const dy = km * Math.sin(angle)
        const lng = s.coordinates[0] + dx / (111.32 * Math.cos((s.coordinates[1] * Math.PI) / 180))
        const lat = s.coordinates[1] + dy / 110.574
        coords.push([lng, lat])
      }
      return {
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [coords] },
        properties: { name: s.name },
      }
    })
  return { type: 'FeatureCollection', features }
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

function getZoomForWidthKm(lat: number, widthKm: number, containerWidth: number): number {
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const pow = (40075 * cosLat * containerWidth) / (512 * widthKm)
  return Math.log2(pow)
}

function getWidthKmForZoom(lat: number, zoom: number, containerPx: number): number {
  const cosLat = Math.cos((lat * Math.PI) / 180)
  return (40075 * cosLat * containerPx) / (512 * Math.pow(2, zoom))
}

function drawMapRuler() {
  if (!rulerCanvas.value || !map || !mapEl.value) return
  const canvas = rulerCanvas.value
  const container = mapEl.value
  const dpr = window.devicePixelRatio || 1
  canvas.width = container.clientWidth * dpr
  canvas.height = container.clientHeight * dpr
  canvas.style.width = `${container.clientWidth}px`
  canvas.style.height = `${container.clientHeight}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)

  const w = container.clientWidth
  const h = container.clientHeight
  const lat = map.getCenter().lat
  const zoom = map.getZoom()
  const widthKm = getWidthKmForZoom(lat, zoom, w)
  const heightKm = getWidthKmForZoom(lat, zoom, h)

  const tickInterval = niceKmInterval(widthKm)
  const pxPerKm = w / widthKm

  ctx.clearRect(0, 0, w, h)
  ctx.font = '10px -apple-system, sans-serif'
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 1

  // Top ruler background
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillRect(0, 0, w, 26)
  // Left ruler background
  ctx.fillRect(0, 0, 30, h)
  ctx.fillStyle = '#333'

  // Top ruler ticks
  const tickCount = Math.ceil(widthKm / tickInterval)
  for (let i = 0; i <= tickCount; i++) {
    const km = i * tickInterval
    const x = km * pxPerKm
    if (x > w) break
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, i % 5 === 0 ? 14 : 8)
    ctx.stroke()
    if (i % 5 === 0) {
      const label =
        tickInterval < 1 ? `${(km * 1000).toFixed(0)}m` : `${km.toFixed(km < 10 ? 1 : 0)}km`
      ctx.fillText(label, x + 2, 22)
    }
  }

  // Left ruler ticks
  const vPxPerKm = h / heightKm
  const vTickCount = Math.ceil(heightKm / tickInterval)
  for (let i = 0; i <= vTickCount; i++) {
    const km = i * tickInterval
    const y = km * vPxPerKm
    if (y > h) break
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(i % 5 === 0 ? 14 : 8, y)
    ctx.stroke()
    if (i % 5 === 0) {
      ctx.save()
      ctx.translate(22, y + 3)
      ctx.rotate(-Math.PI / 2)
      const label =
        tickInterval < 1 ? `${(km * 1000).toFixed(0)}m` : `${km.toFixed(km < 10 ? 1 : 0)}km`
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }
  }
}

function niceKmInterval(totalKm: number): number {
  const targets = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]
  for (const t of targets) {
    if (totalKm / t <= 20 && totalKm / t >= 4) return t
  }
  return Math.pow(10, Math.floor(Math.log10(totalKm / 10)))
}

onMounted(() => {
  if (!mapEl.value) return

  map = new maplibregl.Map({
    container: mapEl.value,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [8.55, 47.38],
    zoom: 10,
    minZoom: getZoomForWidthKm(47.38, 100, mapEl.value.clientWidth || 400),
    maxZoom: getZoomForWidthKm(47.38, 0.05, mapEl.value.clientWidth || 400),
    attributionControl: false,
  })

  map.addControl(new maplibregl.NavigationControl(), 'top-right')

  map.on('moveend', drawMapRuler)
  map.on('zoomend', drawMapRuler)

  map.on('load', () => {
    if (!map) return

    map.addSource('lines', { type: 'geojson', data: buildLinesGeoJSON() })
    map.addSource('search-highlights', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer({
      id: 'search-highlights-fill',
      type: 'fill',
      source: 'search-highlights',
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.15 },
    })
    map.addLayer({
      id: 'search-highlights-outline',
      type: 'line',
      source: 'search-highlights',
      paint: { 'line-color': '#3b82f6', 'line-width': 2 },
    })

    map.addSource('stations', { type: 'geojson', data: buildGeoJSON() })
    map.addSource('favorites', { type: 'geojson', data: buildFavGeoJSON() })
    map.addSource('radius-circle', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })

    // hot = will be/was marked off (red), cold = stays (green) — same rule locked or unlocked.
    const statusColor: maplibregl.ExpressionSpecification = [
      'case',
      ['==', ['get', 'scissorSide'], 'hot'],
      '#dc2626',
      ['==', ['get', 'scissorSide'], 'cold'],
      '#22c55e',
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

    // International/cantonal borders — read from the base style's own vector source
    // (OpenMapTiles schema: admin_level 2 = international, 4 = state/canton), styled distinctly
    // rather than reusing the vendor's own boundary_* layers. Always drawn (no visibility
    // setting). The international filter is restricted to Switzerland's own border (adm0_l/
    // adm0_r = 'CHE') instead of every country's border worldwide, since that's the only one
    // this map ever needs and the vector tiles otherwise carry boundary features for the whole
    // planet.
    map.addLayer({
      id: 'borders-cantonal',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['==', ['get', 'admin_level'], 4],
      paint: {
        'line-color': '#000',
        'line-width': 2.5,
        'line-dasharray': [3, 2],
      },
    })
    map.addLayer({
      id: 'borders-international',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: [
        'all',
        ['==', ['get', 'admin_level'], 2],
        ['any', ['==', ['get', 'adm0_l'], 'CHE'], ['==', ['get', 'adm0_r'], 'CHE']],
      ],
      paint: {
        'line-color': '#000',
        'line-width': 2.5,
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
        'text-size': 22,
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
        'text-offset': [0, -1.5],
        'text-anchor': 'bottom',
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

    // Distance tool: all finalized markings, plus the in-progress pair being placed — both
    // rendered as purple dashed lines so several can be compared on the map at once.
    map.addSource('distance-markings', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer({
      id: 'distance-markings-layer',
      type: 'line',
      source: 'distance-markings',
      paint: {
        'line-color': '#7c3aed',
        'line-width': 3,
        'line-dasharray': [4, 3],
        'line-opacity': 0.85,
      },
    })
    map.addSource('distance-line', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    map.addLayer({
      id: 'distance-line-layer',
      type: 'line',
      source: 'distance-line',
      paint: {
        'line-color': '#a855f7',
        'line-width': 3,
        'line-dasharray': [4, 3],
        'line-opacity': 0.85,
      },
    })
    updateDistanceMarkingsLayer()

    for (const layer of ['stations-layer', 'favorites-layer']) {
      map.on('click', layer, (e) => {
        // While a tool is actively placing, station taps snap the tool's point instead of
        // opening the popup — see handleMapClick.
        if (
          (scissorMode.value && !scissorLocked.value) ||
          (radiusMode.value && !radiusLocked.value) ||
          distanceMode.value
        )
          return
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
    drawMapRuler()

    map.on('click', (e) => handleMapClick(e))

    // Keep bisect line edge-to-edge and handle at correct px offset on pan/zoom
    map.on('moveend', () => {
      if (scissorMode.value && scissorCenter.value) updateScissorVisuals()
    })

    // Auto-open bisect/radius if the URL has ?bisect=/?radius= params
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.has('bisect')) scissorMode.value = true
    if (urlParams.has('radius')) radiusMode.value = true
  })
})

onUnmounted(() => {
  popup?.remove()
  scissorEndpointA?.remove()
  scissorEndpointB?.remove()
  scissorHandle?.remove()
  arrowHeadA?.remove()
  arrowHeadB?.remove()
  hotterMarker?.remove()
  colderMarker?.remove()
  radiusCenterMarker?.remove()
  distanceMarkerA?.remove()
  distanceMarkerB?.remove()
  gpsMarker?.remove()
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

watch(radiusMode, (active) => {
  if (active) loadRadiusFromUrl()
})

watch(radiusMeters, () => {
  if (!radiusCenter.value) return
  resetRadiusToolIds()
  updateRadiusCircle()
  ;(map?.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
  ;(map?.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(buildFavGeoJSON())
})

watch([scissorAngle, scissorDistance], () => {
  if (!scissorStart.value) return
  updateScissorLayers()
})

// Distance only ever changes via the <select> (never via reverse/GPS-snap), so this is
// an unambiguous "the user picked a different distance" — a fresh bisect instance.
watch(scissorDistance, resetScissorToolIds)

watch(scissorMode, (active) => {
  if (active) {
    resetScissorToolIds()
    // Priority: URL param > localStorage > GPS-based default
    if (!loadBisectFromUrl() && !loadSavedBisect()) {
      scissorStart.value = getDefaultBisectStart()
      scissorAngle.value = 90
      scissorDistance.value = 500
    }
    if (!scissorLocked.value) determineStartEndFromGps()
    updateScissorVisuals()
  }
})

watch(distanceMode, (active) => {
  if (!active) cancelDistancePlacement()
})

// Any tool toggle/removal in history can add, hide, or drop a distance marking.
watch(() => store.tools.map((t) => `${t.id}:${t.enabled}`).join(','), updateDistanceMarkingsLayer)

watch(showLocations, (visible) => {
  if (!map) return
  const v = visible ? 'visible' : 'none'
  map.setLayoutProperty('locations-layer', 'visibility', v)
  map.setLayoutProperty('locations-labels', 'visibility', v)
})

watch(stationSearch, () => {
  const source = map?.getSource('search-highlights') as maplibregl.GeoJSONSource | undefined
  if (source) source.setData(buildSearchHighlightGeoJSON())
  if (hideNonMatching.value) {
    ;(map?.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
    ;(map?.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(
      buildFavGeoJSON(),
    )
  }
})

watch(hideNonMatching, () => {
  ;(map?.getSource('stations') as maplibregl.GeoJSONSource | undefined)?.setData(buildGeoJSON())
  ;(map?.getSource('favorites') as maplibregl.GeoJSONSource | undefined)?.setData(buildFavGeoJSON())
})

watch(hideTrainLines, (hidden) => {
  if (!map) return
  map.setLayoutProperty('lines-layer', 'visibility', hidden ? 'none' : 'visible')
})

watch(userPosition, () => {
  updateGpsMarker()
})
</script>

<template>
  <div class="map-wrapper">
    <div ref="mapEl" class="map-container" />
    <canvas ref="rulerCanvas" class="ruler-overlay"></canvas>

    <div class="map-controls">
      <button class="menu-trigger" @click="menuOpen = !menuOpen">⋮</button>
      <div v-if="menuOpen" class="menu-items">
        <button
          :class="['menu-item', { active: hideCrossedOff }]"
          @click="hideCrossedOff = !hideCrossedOff"
        >
          {{ hideCrossedOff ? 'Show all' : 'Hide marked off' }}
        </button>
        <button
          :class="['menu-item', { active: showLocations }]"
          @click="showLocations = !showLocations"
        >
          📍 Places
        </button>
        <button
          :class="['menu-item', { active: radiusMode }]"
          @click="(radiusMode ? clearRadius() : (radiusMode = true), (menuOpen = false))"
        >
          📍 Radius
        </button>
        <button
          :class="['menu-item', { active: scissorMode }]"
          @click="(scissorMode ? clearScissor() : (scissorMode = true), (menuOpen = false))"
        >
          ✂️ Bisect
        </button>
        <button
          :class="['menu-item', { active: distanceMode }]"
          @click="(distanceMode ? clearDistanceMode() : (distanceMode = true), (menuOpen = false))"
        >
          📏 Distance
        </button>
        <button
          :class="['menu-item', { active: showHistory }]"
          @click="((showHistory = !showHistory), (menuOpen = false))"
        >
          📜 History
        </button>
        <button
          :class="['menu-item', { active: hideTrainLines }]"
          @click="hideTrainLines = !hideTrainLines"
        >
          🚂 Hide lines
        </button>
      </div>
    </div>

    <div class="search-panel">
      <input
        v-model="stationSearch"
        type="text"
        class="search-input"
        placeholder="Search stations…"
      />
      <label v-if="stationSearch" class="search-toggle">
        <input
          type="checkbox"
          :checked="hideNonMatching"
          @change="hideNonMatching = !hideNonMatching"
        />
        <span>Hide non-matching</span>
      </label>
    </div>

    <div v-if="distanceMarkings.length > 0" class="distance-stack">
      <div v-for="m in distanceMarkings" :key="m.id" class="distance-stack-row">
        <span class="distance-swatch"></span>
        <span class="distance-stack-label">{{ m.description }}</span>
        <button class="distance-stack-remove" @click="store.toggleTool(m.id)">✕</button>
      </div>
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
        {{
          radiusLocked
            ? 'Shared view — drag disabled'
            : radiusCenter
              ? 'Tap map to move center, or drag the marker'
              : 'Tap map to place circle'
        }}
      </div>
      <div v-if="radiusCenter" class="radius-actions">
        <button class="radius-action-btn radius-clear-btn" @click="clearRadius">Clear</button>
        <button class="radius-action-btn radius-lock-btn" @click="toggleRadiusLock">
          {{ radiusLocked ? '🔓 Unlock to edit' : '🔒 Lock' }}
        </button>
        <button class="radius-action-btn radius-share-btn" @click="shareModalKind = 'radius'">
          🔗 Share
        </button>
        <template v-if="stationsInRadius.size > 0 || radiusInsideMarked">
          <button class="radius-action-btn radius-inside-btn" @click="toggleRadiusInside">
            {{
              radiusInsideMarked
                ? 'Undo inside'
                : `${radiusLocked ? 'Apply' : 'Mark'} inside (${radiusInsideCount})`
            }}
          </button>
        </template>
        <template v-if="radiusOutsideCount > 0 || radiusOutsideMarked">
          <button class="radius-action-btn radius-outside-btn" @click="toggleRadiusOutside">
            {{
              radiusOutsideMarked
                ? 'Undo outside'
                : `${radiusLocked ? 'Apply' : 'Mark'} outside (${radiusOutsideCount})`
            }}
          </button>
        </template>
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
          apart
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
        {{ scissorCenter ? 'Drag the purple handle to set angle' : 'Tap map to place start point' }}
      </div>
      <div v-if="scissorCenter" class="scissor-actions">
        <button class="scissor-cancel-btn" @click="clearScissor">Cancel</button>
        <button class="scissor-lock-btn" @click="toggleScissorLock">
          {{ scissorLocked ? '🔓 Unlock to edit' : '🔒 Lock' }}
        </button>
        <button v-if="!scissorLocked" class="scissor-flip-btn" @click="reverseEndpoints">
          ⟳ Reverse
        </button>
        <button class="scissor-share-btn" @click="shareModalKind = 'bisect'">🔗 Share</button>
        <button
          v-if="scissorHotStations.length > 0 || scissorHotMarked"
          class="scissor-markoff-btn scissor-hot-btn"
          @click="toggleMarkHotter"
        >
          {{
            scissorHotMarked
              ? 'Unmark hotter'
              : scissorLocked
                ? `Apply hotter (${scissorHotStations.length})`
                : `Mark hotter (${scissorHotStations.length})`
          }}
        </button>
        <button
          v-if="scissorColdStations.length > 0 || scissorColdMarked"
          class="scissor-markoff-btn scissor-cold-btn"
          @click="toggleMarkColder"
        >
          {{
            scissorColdMarked
              ? 'Unmark colder'
              : scissorLocked
                ? `Apply colder (${scissorColdStations.length})`
                : `Mark colder (${scissorColdStations.length})`
          }}
        </button>
      </div>
    </div>

    <div v-if="distanceMode" class="distance-panel">
      <div class="distance-label">📏 Distance Tool</div>
      <div v-if="distancePreviewMeters !== null" class="distance-preview">
        {{ formatDistance(distancePreviewMeters) }}
      </div>
      <div class="distance-hint">
        {{
          !distancePointA
            ? 'Tap map to place point A'
            : !distancePointB
              ? 'Tap map to place point B'
              : 'Drag either point to adjust, or Add to save it'
        }}
      </div>
      <div class="distance-actions">
        <button class="distance-action-btn distance-cancel-btn" @click="cancelDistancePlacement">
          Cancel
        </button>
        <button
          v-if="distancePointA && distancePointB"
          class="distance-action-btn distance-add-btn"
          @click="addDistanceMarking"
        >
          + Add
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="shareModalKind" class="overlay" @click.self="shareModalKind = null">
        <div class="modal share-modal">
          <p class="modal-text">Share {{ shareModalKind === 'bisect' ? 'bisect' : 'radius' }}</p>
          <div v-for="point in shareModalPoints" :key="point.label" class="share-point-row">
            <span class="share-point-swatch" :style="{ background: point.color }"></span>
            <span class="share-point-label">{{ point.label }}</span>
            <span class="share-point-coords">
              {{ point.coords[1].toFixed(6) }}, {{ point.coords[0].toFixed(6) }}
            </span>
            <button class="share-point-copy" @click="copySharePointCoords(point)">📋</button>
          </div>
          <div class="modal-buttons">
            <button class="modal-btn cancel-btn" @click="shareModalKind = null">Close</button>
            <button class="modal-btn confirm-btn" @click="copyShareModalUrl">
              🔗 Copy share URL
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showHistory" class="overlay" @click.self="showHistory = false">
        <div class="history-panel">
          <div class="history-header">
            <span class="history-title">📜 History</span>
            <button class="history-close" @click="showHistory = false">✕</button>
          </div>
          <div class="history-list">
            <div
              v-for="entry in store.tools"
              :key="entry.id"
              :class="['history-event', { 'history-event-unknown': entry.type === 'unknown' }]"
            >
              <div class="history-event-main">
                <label class="history-checkbox-label">
                  <input
                    type="checkbox"
                    :checked="entry.enabled"
                    @change="store.toggleTool(entry.id)"
                  />
                </label>
                <span class="history-name">{{ entry.description }}</span>
                <button
                  v-if="['bisect', 'radius', 'endgame'].includes(entry.type)"
                  class="history-undo"
                  @click="loadToolHistoryEntry(entry)"
                >
                  Load
                </button>
                <button class="history-undo" @click="store.removeTool(entry.id)">✕</button>
              </div>
            </div>
            <div v-if="store.tools.length === 0" class="history-empty">No history yet</div>
          </div>
        </div>
      </div>
    </Teleport>

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

.ruler-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}

.search-panel {
  position: absolute;
  top: 12px;
  left: 50px;
  right: 60px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.search-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.search-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #fff;
  border-radius: 6px;
  font-size: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  align-self: flex-start;
}

.search-toggle input[type='checkbox'] {
  width: 14px;
  height: 14px;
  accent-color: #3b82f6;
}

.map-controls {
  position: absolute;
  bottom: 24px;
  left: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-start;
  gap: 0;
}

.menu-trigger {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid #ddd;
  font-size: 32px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  -webkit-tap-highlight-color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.menu-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  background: #fff;
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}

.menu-item {
  padding: 10px 16px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 19.5px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  white-space: nowrap;
  text-align: left;
}

.menu-item.active {
  background: #0066cc;
  color: #fff;
  border-color: #0066cc;
}

.radius-panel {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
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
  display: block;
  width: 50%;
  margin: 4px auto;
  accent-color: #f59e0b;
}

.radius-hint {
  font-size: 12px;
  color: #888;
  text-align: center;
  margin-top: 4px;
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

.radius-clear-btn {
  background: #f0f0f0;
  border: 1px solid #ddd;
  color: #333;
}

.radius-lock-btn {
  background: #fffbeb;
  border: 1px solid #d97706;
  color: #b45309;
}

.radius-share-btn {
  background: #eff6ff;
  border: 1px solid #0066cc;
  color: #0066cc;
}

.radius-inside-btn {
  background: #22c55e;
}

.radius-outside-btn {
  background: #f59e0b;
}

.distance-stack {
  position: absolute;
  top: 12px;
  left: 50px;
  right: 60px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.distance-stack-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border-radius: 8px;
  padding: 6px 10px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  font-size: 12px;
}

.distance-swatch {
  width: 14px;
  height: 3px;
  background: repeating-linear-gradient(
    to right,
    #7c3aed 0,
    #7c3aed 4px,
    transparent 4px,
    transparent 7px
  );
  flex-shrink: 0;
}

.distance-stack-label {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.distance-stack-remove {
  background: none;
  border: none;
  color: #999;
  font-size: 13px;
  cursor: pointer;
  padding: 2px 4px;
}

.distance-panel {
  position: absolute;
  bottom: 12px;
  left: 12px;
  right: 12px;
  background: #fff;
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

.distance-label {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.distance-preview {
  font-size: 20px;
  font-weight: 700;
  color: #7c3aed;
  text-align: center;
  margin: 4px 0;
}

.distance-hint {
  font-size: 12px;
  color: #888;
  text-align: center;
}

.distance-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.distance-action-btn {
  flex: 1;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.distance-cancel-btn {
  background: #f0f0f0;
  color: #333;
}

.distance-add-btn {
  background: #7c3aed;
  color: #fff;
}

.share-modal {
  text-align: left;
}

.share-point-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 13px;
}

.share-point-swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.share-point-label {
  flex-shrink: 0;
  color: #666;
  min-width: 90px;
}

.share-point-coords {
  flex: 1;
  min-width: 0;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.share-point-copy {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
}

.history-checkbox-label input {
  width: 18px;
  height: 18px;
  accent-color: #0066cc;
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

.history-panel {
  width: 80vw;
  height: 80vh;
  max-width: 80vw;
  max-height: 80vh;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #e0e0e0;
}

.history-title {
  font-size: 14px;
  font-weight: 600;
}

.history-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  color: #999;
  padding: 0 4px;
}

.history-list {
  overflow-y: auto;
  flex: 1;
}

.history-event {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}

.history-event-unknown {
  background: #fffbeb;
}

.history-event-unknown .history-name {
  font-style: italic;
  color: #92400e;
}

.history-event-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-name {
  flex: 1;
  min-width: 0;
  font-weight: 500;
}

.history-undo {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  color: #0066cc;
  padding: 2px 4px;
  flex-shrink: 0;
}

.history-empty {
  padding: 24px;
  text-align: center;
  color: #999;
  font-size: 13px;
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
  flex-wrap: wrap;
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
  font-weight: 600;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #fff;
}

.scissor-hot-btn {
  background: #dc2626;
}

.scissor-cold-btn {
  background: #2563eb;
}

.scissor-lock-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #d97706;
  border-radius: 6px;
  background: #fffbeb;
  color: #b45309;
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
  padding: 8px 4px;
}

.maplibregl-popup-close-button {
  font-size: 28px;
  width: 44px;
  height: 44px;
  line-height: 44px;
  text-align: center;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
  top: 0;
  right: 0;
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
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  color: #888;
  cursor: pointer;
  padding: 6px 10px;
  line-height: 1;
  flex-shrink: 0;
}

.map-popup-fav.active {
  color: #f59e0b;
  border-color: #f59e0b;
  background: #fef3c7;
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

.map-popup-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.map-popup-endgame {
  background: #7c3aed;
  border: 1px solid #7c3aed;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: #fff;
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  font-weight: 600;
}
</style>
