<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { circle as turfCircle } from '@turf/circle'
import { intersect as turfIntersect } from '@turf/intersect'
import { featureCollection as turfFeatureCollection } from '@turf/helpers'
import { stations } from '../stations'
import { useStore } from '../store'
import { userPosition } from '../gps'
import { showToast } from '../toast'
import ShareQr from './ShareQr.vue'

const STORAGE_KEY = 'hide-and-seek-endgame'

// A zone answers "inside?" — yes shrinks the displayed hiding zone to the intersection with this
// zone (same opacity as the default hiding zone); no behaves like the old exclusion zones (subtract).
interface Zone {
  id: string
  center: [number, number]
  radiusM: number
  inside: boolean
  // false only while a newly-placed zone hasn't been Saved yet — center/radius are still
  // editable by clicking/dragging. Missing on data saved before this field existed, which is
  // treated as already-saved (locked) below.
  locked: boolean
}

interface EndgameState {
  station: string
  radiusKm: number
  zoom: number
  center: [number, number] | null
  zones: Zone[]
}

// Single source of truth for the fixed hiding-zone radius choices.
// The buttons render from this list, the default is the first entry, and
// stored values are coerced back to one of these when dynamic mode is off.
const FIXED_RADIUS_OPTIONS = [
  { km: 0.5, label: '500 m' },
  { km: 0.8, label: '800 m' },
]
const DEFAULT_RADIUS_KM = FIXED_RADIUS_OPTIONS[0].km
const isFixedRadius = (km: number) => FIXED_RADIUS_OPTIONS.some((o) => o.km === km)

function defaultEndgameState(): EndgameState {
  return {
    station: stations[0].name,
    radiusKm: DEFAULT_RADIUS_KM,
    zoom: 0,
    center: null,
    zones: [],
  }
}

function loadState(): EndgameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // Migrate legacy { exclusions: [...] } (always "outside") into zones with inside: false.
      const rawZones: Array<Partial<Zone>> = parsed.zones ?? parsed.exclusions ?? []
      const zones: Zone[] = rawZones.map((z) => ({
        id: z.id ?? crypto.randomUUID(),
        center: z.center as [number, number],
        radiusM: z.radiusM ?? 500,
        inside: z.inside ?? false,
        locked: z.locked ?? true,
      }))
      return { ...defaultEndgameState(), ...parsed, zones }
    }
  } catch {
    /* corrupted */
  }
  return defaultEndgameState()
}

function saveState(state: EndgameState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const store = useStore()
const saved = loadState()
const selectedStation = ref(saved.station)
const searchQuery = ref(saved.station)
const showDropdown = ref(false)
const radiusKm = ref(
  !store.flexibleHidingZone && !isFixedRadius(saved.radiusKm) ? DEFAULT_RADIUS_KM : saved.radiusKm,
)
const savedZoom = ref(saved.zoom)
const savedCenter = ref<[number, number] | null>(saved.center)
const zones = ref<Zone[]>(saved.zones ?? [])
const selectedZone = ref<string | null>(null)
const placingMode = ref(false)
const mapEl = ref<HTMLDivElement | null>(null)
const rulerCanvas = ref<HTMLCanvasElement | null>(null)
const drawCanvas = ref<HTMLCanvasElement | null>(null)
const drawMode = ref(false)
let isDrawing = false
const closestStationName = computed(() => {
  if (!userPosition.value) return null
  return findClosestStation(userPosition.value)
})
let map: maplibregl.Map | null = null
let constraining = false
let gpsMarker: maplibregl.Marker | null = null
let zoneEdgeHandle: maplibregl.Marker | null = null

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

function findClosestStation(lngLat: [number, number]): string {
  let best = stations[0].name
  let bestDist = Infinity
  for (const s of stations) {
    const d = haversineMeters(lngLat, s.coordinates)
    if (d < bestDist) {
      bestDist = d
      best = s.name
    }
  }
  return best
}

function useClosestStation() {
  if (closestStationName.value) {
    selectStation(closestStationName.value)
  }
}

// GPS marker: watch global position and update marker on the endgame map
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

function encodeZones(list: Zone[]): string {
  return list
    .map(
      (z) => `${z.center[0].toFixed(6)},${z.center[1].toFixed(6)},${z.radiusM},${z.inside ? 1 : 0}`,
    )
    .join(';')
}

function decodeZones(raw: string): Zone[] {
  return raw
    .split(';')
    .filter(Boolean)
    .map((part) => {
      const [lng, lat, radiusM, inside] = part.split(',').map(Number)
      return {
        id: crypto.randomUUID(),
        center: [lng, lat] as [number, number],
        radiusM,
        inside: inside === 1,
        locked: true,
      }
    })
}

const urlParams = new URLSearchParams(window.location.search)
const pendingUrlStation = urlParams.get('endgame')
const pendingUrlRadiusKm = urlParams.get('radiusKm')
const pendingUrlZones = urlParams.get('zones')

// Remove ?endgame=/?radiusKm=/?zones= from URL immediately (consumed in onMounted)
if (pendingUrlStation) {
  const url = new URL(window.location.href)
  url.searchParams.delete('endgame')
  url.searchParams.delete('radiusKm')
  url.searchParams.delete('zones')
  history.replaceState(null, '', url)
}

const shareModalOpen = ref(false)
const shareModalUrl = ref<string | null>(null)

function shareEndgame() {
  const url = new URL(window.location.href)
  // Endgame's share link is entirely separate from the main map's — never carry the map's tool
  // history (or another tool's single-geometry share) into it.
  url.searchParams.delete('t')
  url.searchParams.delete('c')
  url.searchParams.delete('bisect')
  url.searchParams.delete('radius')
  url.searchParams.set('endgame', selectedStation.value)
  url.searchParams.set('radiusKm', String(radiusKm.value))
  if (zones.value.length > 0) url.searchParams.set('zones', encodeZones(zones.value))
  else url.searchParams.delete('zones')
  shareModalUrl.value = url.toString()
  shareModalOpen.value = true
  store.addTool('endgame', `Endgame · ${selectedStation.value}`, [], {
    params: {
      station: selectedStation.value,
      radiusKm: radiusKm.value,
      zones: zones.value.map((z) => ({ center: z.center, radiusM: z.radiusM, inside: z.inside })),
    },
  })
}

function copyShareModalUrl() {
  if (!shareModalUrl.value) return
  navigator.clipboard.writeText(shareModalUrl.value)
  showToast('Link copied', 'success')
}

function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const filteredStations = computed(() => {
  const q = normalize(searchQuery.value)
  if (!q) return stations
  return stations.filter((s) => normalize(s.name).includes(q))
})

function selectStation(name: string) {
  selectedStation.value = name
  searchQuery.value = name
  showDropdown.value = false
}

function onInputFocus() {
  showDropdown.value = true
  searchQuery.value = ''
}

function onInputBlur() {
  setTimeout(() => {
    showDropdown.value = false
  }, 150)
}

function onSearchInput() {
  showDropdown.value = true
}

const station = computed(
  () => stations.find((s) => s.name === selectedStation.value) ?? stations[0],
)

const activeZone = computed(() => zones.value.find((z) => z.id === selectedZone.value))

function getZoomForWidthKm(lat: number, widthKm: number, containerWidth: number): number {
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const pow = (40075 * cosLat * containerWidth) / (512 * widthKm)
  return Math.log2(pow)
}

function getWidthMetersForZoom(lat: number, zoom: number, containerPx: number): number {
  const cosLat = Math.cos((lat * Math.PI) / 180)
  return (40075000 * cosLat * containerPx) / (512 * Math.pow(2, zoom))
}

function buildCircleCoords(center: [number, number], radiusM: number): [number, number][] {
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
  return coords
}

// Base hiding-zone circle intersected with every "inside" zone (AND — must be within all of
// them), via Turf. "Outside" zones don't affect this shape — they're rendered separately as an
// overlay, unchanged from the old exclusion-zone behavior.
function buildHidingZoneGeoJSON(): GeoJSON.FeatureCollection {
  let shape: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null = turfCircle(
    station.value.coordinates,
    radiusKm.value,
    { steps: 64, units: 'kilometers' },
  )
  for (const z of zones.value.filter((z) => z.inside)) {
    if (!shape) break
    const zCircle = turfCircle(z.center, z.radiusM / 1000, { steps: 64, units: 'kilometers' })
    shape = turfIntersect(turfFeatureCollection([shape, zCircle]))
  }
  return { type: 'FeatureCollection', features: shape ? [shape] : [] }
}

function buildOutsideZonesGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.value
      .filter((z) => !z.inside)
      .map((z) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [buildCircleCoords(z.center, z.radiusM)],
        },
        properties: { id: z.id, selected: z.id === selectedZone.value ? 'yes' : 'no' },
      })),
  }
}

// Dashed outline of each raw "inside" zone circle, so its boundary stays visible once it's
// been absorbed into the composite hiding-zone shape.
function buildInsideZoneOutlinesGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.value
      .filter((z) => z.inside)
      .map((z) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [buildCircleCoords(z.center, z.radiusM)],
        },
        properties: { id: z.id, selected: z.id === selectedZone.value ? 'yes' : 'no' },
      })),
  }
}

function buildZoneCentersGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.value.map((z) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: z.center },
      properties: { id: z.id, inside: z.inside ? 'yes' : 'no' },
    })),
  }
}

function updateZoneLayers() {
  if (!map) return
  const hidingSource = map.getSource('hiding-zone') as maplibregl.GeoJSONSource | undefined
  const outsideSource = map.getSource('exclusions-fill') as maplibregl.GeoJSONSource | undefined
  const insideOutlineSource = map.getSource('inside-zone-outlines') as
    | maplibregl.GeoJSONSource
    | undefined
  const centerSource = map.getSource('exclusion-centers') as maplibregl.GeoJSONSource | undefined
  const hidingData = buildHidingZoneGeoJSON()
  if (hidingSource) hidingSource.setData(hidingData)
  if (outsideSource) outsideSource.setData(buildOutsideZonesGeoJSON())
  if (insideOutlineSource) insideOutlineSource.setData(buildInsideZoneOutlinesGeoJSON())
  if (centerSource) centerSource.setData(buildZoneCentersGeoJSON())
  if (hidingData.features.length === 0 && zones.value.some((z) => z.inside)) {
    showToast('Inside zones do not overlap — hiding zone is empty', 'error')
  }
}

function addZone(lngLat: [number, number]) {
  const z: Zone = {
    id: crypto.randomUUID(),
    center: lngLat,
    radiusM: 250,
    inside: false,
    locked: false,
  }
  zones.value.push(z)
  selectedZone.value = z.id
  updateZoneLayers()
  updateZoneEdgeHandle()
  persist()
}

function removeZone(id: string) {
  const idx = zones.value.findIndex((z) => z.id === id)
  if (idx !== -1) zones.value.splice(idx, 1)
  if (selectedZone.value === id) selectedZone.value = null
  updateZoneLayers()
  updateZoneEdgeHandle()
  persist()
}

function updateZoneRadius(id: string, radiusM: number) {
  const z = zones.value.find((z) => z.id === id)
  if (z && !z.locked) {
    z.radiusM = radiusM
    updateZoneLayers()
    updateZoneEdgeHandle()
    persist()
  }
}

function updateZoneInside(id: string, inside: boolean) {
  const z = zones.value.find((z) => z.id === id)
  if (z) {
    z.inside = inside
    updateZoneLayers()
    persist()
  }
}

// Save locks the zone's position/radius against accidental further edits (Remove still works);
// Cancel discards the never-saved zone outright.
function saveZone(id: string) {
  const z = zones.value.find((z) => z.id === id)
  if (z) {
    z.locked = true
    updateZoneEdgeHandle()
    persist()
  }
}

function cancelZone(id: string) {
  removeZone(id)
}

function persist() {
  const center = map ? ([map.getCenter().lng, map.getCenter().lat] as [number, number]) : null
  const zoom = map ? map.getZoom() : 0
  saveState({
    station: selectedStation.value,
    radiusKm: radiusKm.value,
    zoom,
    center,
    zones: zones.value,
  })
}

function constrainPan() {
  if (!map || constraining) return
  const stationCoords = station.value.coordinates
  const center = map.getCenter()
  const dx = (center.lng - stationCoords[0]) * 111320 * Math.cos((stationCoords[1] * Math.PI) / 180)
  const dy = (center.lat - stationCoords[1]) * 110574
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > 5000) {
    constraining = true
    const scale = 5000 / dist
    const newLng = stationCoords[0] + (center.lng - stationCoords[0]) * scale
    const newLat = stationCoords[1] + (center.lat - stationCoords[1]) * scale
    map.setCenter([newLng, newLat])
    constraining = false
  }
}

function drawRuler() {
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
  const widthM = getWidthMetersForZoom(lat, zoom, w)
  const heightM = getWidthMetersForZoom(lat, zoom, h)

  const tickInterval = niceInterval(widthM)
  const pxPerMeter = w / widthM

  ctx.clearRect(0, 0, w, h)
  ctx.font = '10px -apple-system, sans-serif'
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'
  ctx.lineWidth = 1

  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillRect(0, 0, w, 26)
  ctx.fillRect(0, 0, 30, h)
  ctx.fillStyle = '#333'

  const tickCount = Math.ceil(widthM / tickInterval)
  for (let i = 0; i <= tickCount; i++) {
    const m = i * tickInterval
    const x = m * pxPerMeter
    if (x > w) break
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, i % 5 === 0 ? 14 : 8)
    ctx.stroke()
    if (i % 5 === 0) {
      ctx.fillText(`${Math.round(m)}`, x + 2, 22)
    }
  }

  const vPxPerMeter = h / heightM
  const vTickCount = Math.ceil(heightM / tickInterval)
  for (let i = 0; i <= vTickCount; i++) {
    const m = i * tickInterval
    const y = m * vPxPerMeter
    if (y > h) break
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(i % 5 === 0 ? 14 : 8, y)
    ctx.stroke()
    if (i % 5 === 0) {
      ctx.save()
      ctx.translate(22, y + 3)
      ctx.rotate(-Math.PI / 2)
      ctx.fillText(`${Math.round(m)}`, 0, 0)
      ctx.restore()
    }
  }
}

function niceInterval(totalM: number): number {
  const targets = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]
  for (const t of targets) {
    if (totalM / t <= 20 && totalM / t >= 4) return t
  }
  return Math.pow(10, Math.floor(Math.log10(totalM / 10)))
}

function getDrawCtx(): CanvasRenderingContext2D | null {
  if (!drawCanvas.value || !mapEl.value) return null
  const canvas = drawCanvas.value
  const container = mapEl.value
  const dpr = window.devicePixelRatio || 1
  // Round to whole pixels: canvas.width truncates floats, so comparing against
  // a fractional clientWidth * dpr (fractional DPRs are common on Android) would
  // always mismatch and resize — clearing the canvas — on every pointer move.
  const targetW = Math.round(container.clientWidth * dpr)
  const targetH = Math.round(container.clientHeight * dpr)
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW
    canvas.height = targetH
    canvas.style.width = `${container.clientWidth}px`
    canvas.style.height = `${container.clientHeight}px`
  }
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function onDrawStart(e: MouseEvent | TouchEvent) {
  if (!drawMode.value) return
  isDrawing = true
  const ctx = getDrawCtx()
  if (!ctx) return
  const pos = getEventPos(e)
  ctx.beginPath()
  ctx.moveTo(pos.x, pos.y)
  ctx.strokeStyle = '#dc2626'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

function onDrawMove(e: MouseEvent | TouchEvent) {
  if (!isDrawing || !drawMode.value) return
  e.preventDefault()
  const ctx = getDrawCtx()
  if (!ctx) return
  const pos = getEventPos(e)
  ctx.lineTo(pos.x, pos.y)
  ctx.stroke()
}

function onDrawEnd() {
  isDrawing = false
}

function getEventPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
  const canvas = drawCanvas.value!
  const rect = canvas.getBoundingClientRect()
  if ('touches' in e) {
    const touch = e.touches[0] ?? (e as TouchEvent).changedTouches[0]
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
  }
  return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top }
}

function clearDrawing() {
  const canvas = drawCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
}

// The draw canvas already isolates just the drawn line (transparent background) — composite it
// onto a white background so only the line is visible, then auto-download.
function saveDrawing() {
  const lineCanvas = drawCanvas.value
  if (!lineCanvas) return
  try {
    const out = document.createElement('canvas')
    out.width = lineCanvas.width
    out.height = lineCanvas.height
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('no context')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(lineCanvas, 0, 0)
    out.toBlob((blob) => {
      if (!blob) {
        showToast('Could not export image', 'error')
        return
      }
      try {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${Math.floor(Date.now() / 1000)}.png`
        a.click()
        URL.revokeObjectURL(url)
        showToast('Drawing saved', 'success')
      } catch {
        showToast('Download failed', 'error')
      }
    }, 'image/png')
  } catch {
    showToast('Could not export image', 'error')
  }
}

function handleMapClick(e: maplibregl.MapMouseEvent) {
  if (placingMode.value) {
    addZone([e.lngLat.lng, e.lngLat.lat])
    placingMode.value = false
    return
  }
  if (!map) return
  const features = map.queryRenderedFeatures(e.point, { layers: ['exclusion-centers-layer'] })
  if (features.length > 0) {
    const id = features[0].properties?.id
    if (id) {
      // Clicking a zone's center always re-opens its panel, even once saved/locked.
      selectedZone.value = selectedZone.value === id ? null : id
      updateZoneLayers()
      updateZoneEdgeHandle()
    }
    return
  }
  // Tapping elsewhere on the map moves the selected zone's center — but only while it's still
  // unsaved, so a saved zone can't be nudged by an accidental tap.
  if (activeZone.value && !activeZone.value.locked) {
    activeZone.value.center = [e.lngLat.lng, e.lngLat.lat]
    updateZoneLayers()
    updateZoneEdgeHandle()
    persist()
    return
  }
  selectedZone.value = null
  updateZoneLayers()
  updateZoneEdgeHandle()
}

// Point due east of the zone's center at its current radius — the draggable handle that resizes
// the zone without moving its center.
function zoneEdgePoint(z: Zone): [number, number] {
  const dLngPerM = 1 / (111320 * Math.cos((z.center[1] * Math.PI) / 180))
  return [z.center[0] + z.radiusM * dLngPerM, z.center[1]]
}

function createEdgeHandleEl(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText =
    'width:22px;height:22px;border-radius:50%;background:#0ea5e9;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);cursor:ew-resize;touch-action:none;'
  return el
}

function onZoneEdgeDrag() {
  if (!zoneEdgeHandle || !activeZone.value) return
  const { lng, lat } = zoneEdgeHandle.getLngLat()
  const radiusM = haversineMeters(activeZone.value.center, [lng, lat])
  updateZoneRadius(activeZone.value.id, Math.max(10, Math.round(radiusM)))
}

// Shows a draggable handle on the edge of the selected zone's circle while it's still unsaved —
// dragging it changes only the radius, never the center.
function updateZoneEdgeHandle() {
  if (!map) return
  const z = activeZone.value
  if (!z || z.locked) {
    zoneEdgeHandle?.remove()
    zoneEdgeHandle = null
    return
  }
  const pos = zoneEdgePoint(z)
  if (!zoneEdgeHandle) {
    zoneEdgeHandle = new maplibregl.Marker({ element: createEdgeHandleEl(), draggable: true })
      .setLngLat(pos)
      .addTo(map)
    zoneEdgeHandle.on('drag', onZoneEdgeDrag)
  } else {
    zoneEdgeHandle.setLngLat(pos)
  }
}

function updateMap() {
  if (!map || !mapEl.value) return
  const coords = station.value.coordinates
  const containerWidth = mapEl.value.clientWidth || 400
  const minZoom = getZoomForWidthKm(coords[1], 5, containerWidth)
  const maxZoom = getZoomForWidthKm(coords[1], 0.05, containerWidth)
  const defaultZoom = getZoomForWidthKm(coords[1], 1.2, containerWidth)

  map.setMinZoom(minZoom)
  map.setMaxZoom(maxZoom)
  map.setCenter(coords)
  map.setZoom(defaultZoom)
  savedCenter.value = null
  savedZoom.value = 0

  const source = map.getSource('hiding-zone') as maplibregl.GeoJSONSource | undefined
  if (source) {
    source.setData(buildHidingZoneGeoJSON())
  }
  persist()
  drawRuler()
}

onMounted(() => {
  if (!mapEl.value) return
  const coords = station.value.coordinates
  const containerWidth = mapEl.value.clientWidth || 400
  const minZoom = getZoomForWidthKm(coords[1], 5, containerWidth)
  const maxZoom = getZoomForWidthKm(coords[1], 0.05, containerWidth)
  const defaultZoom = getZoomForWidthKm(coords[1], 1.2, containerWidth)

  const initialCenter = savedCenter.value ?? coords
  const initialZoom =
    savedZoom.value > 0 ? Math.max(minZoom, Math.min(maxZoom, savedZoom.value)) : defaultZoom

  map = new maplibregl.Map({
    container: mapEl.value,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: initialCenter,
    zoom: initialZoom,
    minZoom,
    maxZoom,
    dragRotate: false,
    touchPitch: false,
    pitchWithRotate: false,
    attributionControl: false,
  })

  map.on('moveend', () => {
    constrainPan()
    persist()
    drawRuler()
  })

  map.on('zoomend', () => {
    persist()
    drawRuler()
  })

  map.on('click', handleMapClick)

  map.on('load', () => {
    if (!map) return

    // Hiding zone (green)
    map.addSource('hiding-zone', { type: 'geojson', data: buildHidingZoneGeoJSON() })
    map.addLayer({
      id: 'hiding-zone-fill',
      type: 'fill',
      source: 'hiding-zone',
      paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.11 },
    })
    map.addLayer({
      id: 'hiding-zone-outline',
      type: 'line',
      source: 'hiding-zone',
      paint: { 'line-color': '#16a34a', 'line-width': 2 },
    })

    // Outside zones — subtract-style overlay (red), unchanged from the old exclusion zones
    map.addSource('exclusions-fill', { type: 'geojson', data: buildOutsideZonesGeoJSON() })
    map.addLayer({
      id: 'exclusions-fill-layer',
      type: 'fill',
      source: 'exclusions-fill',
      paint: {
        'fill-color': '#dc2626',
        'fill-opacity': ['case', ['==', ['get', 'selected'], 'yes'], 0.63, 0.38],
      },
    })
    map.addLayer({
      id: 'exclusions-outline-layer',
      type: 'line',
      source: 'exclusions-fill',
      paint: {
        'line-color': '#dc2626',
        'line-width': ['case', ['==', ['get', 'selected'], 'yes'], 3, 1.5],
      },
    })

    // Inside zones — dashed blue outline of the raw circle, kept visible once absorbed into
    // the composite hiding-zone shape.
    map.addSource('inside-zone-outlines', {
      type: 'geojson',
      data: buildInsideZoneOutlinesGeoJSON(),
    })
    map.addLayer({
      id: 'inside-zone-outline-layer',
      type: 'line',
      source: 'inside-zone-outlines',
      paint: {
        'line-color': '#0ea5e9',
        'line-width': ['case', ['==', ['get', 'selected'], 'yes'], 3, 1.5],
        'line-dasharray': [3, 2],
      },
    })

    // Zone center points (for click detection) — all zones, colored by inside/outside
    map.addSource('exclusion-centers', { type: 'geojson', data: buildZoneCentersGeoJSON() })
    map.addLayer({
      id: 'exclusion-centers-layer',
      type: 'circle',
      source: 'exclusion-centers',
      paint: {
        'circle-radius': 12,
        'circle-color': ['case', ['==', ['get', 'inside'], 'yes'], '#0ea5e9', '#dc2626'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    })

    // Station marker
    map.addSource('station-marker', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: coords }, properties: {} },
        ],
      },
    })
    map.addLayer({
      id: 'station-marker-circle',
      type: 'circle',
      source: 'station-marker',
      paint: {
        'circle-radius': 8,
        'circle-color': '#7c3aed',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
      },
    })

    drawRuler()

    // If URL had ?endgame=StationName (+ optional ?radiusKm=/?zones=), load it now
    if (pendingUrlStation) {
      const match = stations.find((s) => s.name === pendingUrlStation)
      if (match) selectStation(match.name)
      if (pendingUrlRadiusKm) {
        const km = Number(pendingUrlRadiusKm)
        if (!Number.isNaN(km)) {
          radiusKm.value = !store.flexibleHidingZone && !isFixedRadius(km) ? DEFAULT_RADIUS_KM : km
        }
      }
      if (pendingUrlZones) {
        zones.value = decodeZones(pendingUrlZones)
      }
      updateZoneLayers()
      persist()
    }
  })
})

onUnmounted(() => {
  persist()
  gpsMarker?.remove()
  zoneEdgeHandle?.remove()
  map?.remove()
  map = null
})

watch(selectedStation, () => {
  updateMap()
  if (!map) return
  const source = map.getSource('station-marker') as maplibregl.GeoJSONSource | undefined
  if (source) {
    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: station.value.coordinates },
          properties: {},
        },
      ],
    })
  }
})

watch(radiusKm, () => {
  const source = map?.getSource('hiding-zone') as maplibregl.GeoJSONSource | undefined
  if (source) source.setData(buildHidingZoneGeoJSON())
  persist()
})

watch(
  () => store.flexibleHidingZone,
  (flexible) => {
    if (!flexible && !isFixedRadius(radiusKm.value)) {
      radiusKm.value = DEFAULT_RADIUS_KM
    }
  },
)

watch(userPosition, () => {
  updateGpsMarker()
  // Auto-select closest station on first GPS fix if no explicit selection
  if (
    userPosition.value &&
    selectedStation.value === stations[0].name &&
    saved.station === stations[0].name &&
    !pendingUrlStation
  ) {
    const closest = findClosestStation(userPosition.value)
    selectStation(closest)
  }
})

// The pencil toggle also drives fullscreen (see .fullscreen-draw in the template): the map
// wrapper is teleported to <body> and expanded to fill the viewport, locked in place, until the
// pencil is pressed again.
watch(drawMode, (active) => {
  if (!map) return
  if (active) {
    map.dragPan.disable()
    map.scrollZoom.disable()
    map.doubleClickZoom.disable()
    map.touchZoomRotate.disable()
  } else {
    map.dragPan.enable()
    map.scrollZoom.enable()
    map.doubleClickZoom.enable()
    map.touchZoomRotate.enable()
  }
  // The container's pixel size changes when entering/exiting fullscreen — resize the map and
  // re-size/re-draw the overlay canvases only after that layout change has actually happened.
  nextTick(() => {
    map?.resize()
    if (drawCanvas.value && mapEl.value) {
      const dpr = window.devicePixelRatio || 1
      drawCanvas.value.width = Math.round(mapEl.value.clientWidth * dpr)
      drawCanvas.value.height = Math.round(mapEl.value.clientHeight * dpr)
      drawCanvas.value.style.width = `${mapEl.value.clientWidth}px`
      drawCanvas.value.style.height = `${mapEl.value.clientHeight}px`
    }
    drawRuler()
  })
})

const radiusLabel = computed(() => {
  const m = radiusKm.value * 1000
  return `${Math.round(m)} m`
})

const zoneRadiusLabel = computed(() => {
  if (!activeZone.value) return ''
  const m = activeZone.value.radiusM
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`
})
</script>

<template>
  <div class="endgame">
    <div class="endgame-controls">
      <label class="endgame-field">
        <span class="endgame-label">Station</span>
        <div class="station-search">
          <div class="station-input-row">
            <input
              v-model="searchQuery"
              type="text"
              class="endgame-input"
              placeholder="Search station…"
              @focus="onInputFocus"
              @blur="onInputBlur"
              @input="onSearchInput"
            />
            <button v-if="closestStationName" class="use-current-btn" @click="useClosestStation">
              📍 {{ closestStationName }}
            </button>
            <button v-else class="use-current-btn" disabled>⏳ Locating…</button>
          </div>
          <ul v-if="showDropdown" class="station-dropdown">
            <li
              v-for="s in filteredStations"
              :key="s.name"
              :class="['station-option', { selected: s.name === selectedStation }]"
              @mousedown.prevent="selectStation(s.name)"
            >
              {{ s.name }}
            </li>
            <li v-if="filteredStations.length === 0" class="station-option no-results">
              No matches
            </li>
          </ul>
        </div>
      </label>

      <button class="endgame-share-btn" @click="shareEndgame">🔗 Share</button>

      <a
        class="gmaps-link"
        :href="`https://www.google.com/maps/@${station.coordinates[1]},${station.coordinates[0]},16z`"
        target="_blank"
        rel="noopener"
      >
        Google Maps ↗
      </a>

      <label class="endgame-field">
        <span class="endgame-label">Hiding Zone Radius: {{ radiusLabel }}</span>
        <div v-if="store.flexibleHidingZone" class="slider-row">
          <input
            v-model.number="radiusKm"
            type="range"
            min="0.25"
            max="2"
            step="0.01"
            class="endgame-slider"
          />
        </div>
        <div v-else class="toggle-radius">
          <button
            v-for="opt in FIXED_RADIUS_OPTIONS"
            :key="opt.km"
            :class="['radius-option', { active: radiusKm === opt.km }]"
            @click="radiusKm = opt.km"
          >
            {{ opt.label }}
          </button>
        </div>
      </label>

      <div class="exclusion-controls">
        <div class="excl-btn-row">
          <button
            :class="['excl-btn', { active: placingMode }]"
            @click="placingMode = !placingMode"
          >
            {{ placingMode ? 'Cancel' : '+ Zone' }}
          </button>
        </div>

        <div v-if="activeZone" class="excl-selected">
          <div class="zone-inside-toggle">
            <button
              :class="['zone-toggle-btn', { active: !activeZone.inside }]"
              @click="updateZoneInside(activeZone!.id, false)"
            >
              Outside (exclude)
            </button>
            <button
              :class="['zone-toggle-btn', { active: activeZone.inside }]"
              @click="updateZoneInside(activeZone!.id, true)"
            >
              Inside (must be within)
            </button>
          </div>
          <label v-if="!activeZone.locked" class="endgame-field">
            <span class="endgame-label">Zone radius: {{ zoneRadiusLabel }}</span>
            <input
              :value="activeZone.radiusM"
              type="range"
              min="0"
              max="2000"
              step="10"
              class="endgame-slider excl-slider"
              @input="
                updateZoneRadius(activeZone!.id, Number(($event.target as HTMLInputElement).value))
              "
            />
          </label>
          <div v-else class="endgame-field">
            <span class="endgame-label">Zone radius: {{ zoneRadiusLabel }} · saved</span>
          </div>
          <div v-if="!activeZone.locked" class="zone-save-row">
            <button class="zone-cancel-btn" @click="cancelZone(activeZone!.id)">Cancel</button>
            <button class="zone-save-btn" @click="saveZone(activeZone!.id)">Save</button>
          </div>
          <div v-if="!activeZone.locked" class="placing-hint-inline">
            Tap the map to move · drag the blue handle to resize
          </div>
          <button class="excl-remove-btn" @click="removeZone(activeZone!.id)">Remove</button>
        </div>
      </div>
    </div>

    <Teleport to="body" :disabled="!drawMode">
      <div :class="['endgame-map-wrapper', { 'fullscreen-draw': drawMode }]">
        <div ref="mapEl" class="endgame-map"></div>
        <canvas ref="rulerCanvas" class="ruler-overlay"></canvas>
        <canvas
          ref="drawCanvas"
          :class="['draw-overlay', { active: drawMode }]"
          @mousedown="onDrawStart"
          @mousemove="onDrawMove"
          @mouseup="onDrawEnd"
          @mouseleave="onDrawEnd"
          @touchstart="onDrawStart"
          @touchmove="onDrawMove"
          @touchend="onDrawEnd"
        ></canvas>
        <div class="draw-toolbar">
          <button
            :class="['draw-toggle', { active: drawMode }]"
            @click="drawMode ? ((drawMode = false), clearDrawing()) : (drawMode = true)"
          >
            ✏️
          </button>
          <template v-if="drawMode">
            <button class="draw-btn" @click="clearDrawing">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 10h10c4 0 6 2 6 5s-2 5-6 5H9" />
                <polyline points="7 6 3 10 7 14" />
              </svg>
            </button>
            <button class="draw-btn" @click="saveDrawing">💾</button>
          </template>
        </div>
        <div v-if="placingMode" class="placing-hint">Tap map to place zone</div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="shareModalOpen" class="overlay" @click.self="shareModalOpen = false">
        <div class="modal">
          <p class="modal-text">Share endgame</p>
          <ShareQr v-if="shareModalUrl" :url="shareModalUrl" />
          <div class="modal-buttons">
            <button class="modal-btn cancel-btn" @click="shareModalOpen = false">Close</button>
            <button class="modal-btn confirm-btn" @click="copyShareModalUrl">
              🔗 Copy share URL
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.endgame {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.endgame-controls {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.endgame-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.endgame-label {
  font-size: 13px;
  font-weight: 600;
  color: #444;
}

.station-search {
  position: relative;
}

.station-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.endgame-input {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  font-size: 15px;
  background: #fff;
}

.use-current-btn {
  padding: 8px 10px;
  background: #f0f7ff;
  border: 1px solid #0066cc;
  border-radius: 6px;
  color: #0066cc;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.gmaps-link {
  display: inline;
  font-size: 13px;
  color: #0066cc;
  text-decoration: none;
  align-self: flex-start;
}

.endgame-share-btn {
  align-self: flex-start;
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #0066cc;
  border-radius: 6px;
  color: #0066cc;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.gmaps-link:active {
  text-decoration: underline;
}

.station-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #d0d0d0;
  border-top: none;
  border-radius: 0 0 6px 6px;
  list-style: none;
  z-index: 20;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.station-option {
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
}

.station-option:hover {
  background: #f0f7ff;
}

.station-option.selected {
  background: #e8f0fe;
  font-weight: 600;
}

.station-option.no-results {
  color: #999;
  cursor: default;
}

.endgame-slider {
  width: 100%;
  cursor: pointer;
}

.toggle-radius {
  display: flex;
  gap: 8px;
}

.radius-option {
  flex: 1;
  padding: 10px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  background: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
}

.radius-option.active {
  background: #22c55e;
  color: #fff;
  border-color: #22c55e;
}

.excl-slider {
  accent-color: #dc2626;
}

.exclusion-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.excl-btn-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.excl-btn {
  padding: 8px 14px;
  background: #fff;
  border: 1px solid #dc2626;
  border-radius: 6px;
  color: #dc2626;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-start;
}

.excl-btn.active {
  background: #dc2626;
  color: #fff;
}

.excl-selected {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: #fef2f2;
  border-radius: 6px;
  border: 1px solid #fecaca;
}

.zone-inside-toggle {
  display: flex;
  gap: 8px;
}

.zone-toggle-btn {
  flex: 1;
  padding: 8px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
}

.zone-toggle-btn.active {
  background: #0ea5e9;
  color: #fff;
  border-color: #0ea5e9;
}

.zone-save-row {
  display: flex;
  gap: 8px;
}

.zone-cancel-btn,
.zone-save-btn {
  flex: 1;
  padding: 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  border: 1px solid #d0d0d0;
}

.zone-cancel-btn {
  background: #fff;
  color: #666;
}

.zone-save-btn {
  background: #16a34a;
  color: #fff;
  border-color: #16a34a;
}

.placing-hint-inline {
  font-size: 11px;
  color: #888;
}

.excl-remove-btn {
  padding: 6px 12px;
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-start;
}

.endgame-map-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
}

.endgame-map-wrapper.fullscreen-draw {
  position: fixed;
  inset: 0;
  z-index: 200;
}

.endgame-map {
  position: absolute;
  inset: 0;
}

.ruler-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}

.draw-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 8;
}

.draw-overlay.active {
  pointer-events: auto;
  cursor: crosshair;
  touch-action: none;
}

.draw-toolbar {
  position: absolute;
  bottom: 16px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 10;
}

.draw-toggle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid #ddd;
  background: #fff;
  font-size: 18px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.draw-toggle.active {
  background: #dc2626;
  border-color: #dc2626;
}

.draw-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid #ddd;
  background: #fff;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placing-hint {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(220, 38, 38, 0.9);
  color: #fff;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  z-index: 10;
  pointer-events: none;
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
  margin-bottom: 20px;
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
}

.cancel-btn {
  background: #f0f0f0;
  color: #333;
}

.confirm-btn {
  background: #dc2626;
  color: #fff;
}
</style>
