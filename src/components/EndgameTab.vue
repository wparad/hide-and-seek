<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { stations } from '../stations'
import { useStore } from '../store'

const STORAGE_KEY = 'hide-and-seek-endgame'

interface ExclusionCircle {
  id: string
  center: [number, number]
  radiusM: number
}

interface EndgameState {
  station: string
  radiusKm: number
  zoom: number
  center: [number, number] | null
  exclusions: ExclusionCircle[]
}

function loadState(): EndgameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* corrupted */
  }
  return { station: stations[0].name, radiusKm: 0.5, zoom: 0, center: null, exclusions: [] }
}

function saveState(state: EndgameState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const saved = loadState()
const selectedStation = ref(saved.station)
const searchQuery = ref(saved.station)
const showDropdown = ref(false)
const radiusKm = ref(saved.radiusKm)
const savedZoom = ref(saved.zoom)
const savedCenter = ref<[number, number] | null>(saved.center)
const exclusions = ref<ExclusionCircle[]>(saved.exclusions ?? [])
const selectedExclusion = ref<string | null>(null)
const placingMode = ref(false)
const showClearExclModal = ref(false)
const mapEl = ref<HTMLDivElement | null>(null)
const rulerCanvas = ref<HTMLCanvasElement | null>(null)
const closestStationName = ref<string | null>(null)
let map: maplibregl.Map | null = null
let constraining = false
const store = useStore()

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

// GPS: auto-detect closest station on first load if no station was saved
function initGps() {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition((pos) => {
    const lngLat: [number, number] = [pos.coords.longitude, pos.coords.latitude]
    closestStationName.value = findClosestStation(lngLat)
    // Auto-select if the saved station is the default (first in array = never explicitly chosen)
    if (selectedStation.value === stations[0].name && saved.station === stations[0].name) {
      selectStation(closestStationName.value)
    }
  })
}
initGps()

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

const activeExclusion = computed(() =>
  exclusions.value.find((e) => e.id === selectedExclusion.value),
)

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

function buildHidingZoneGeoJSON(): GeoJSON.FeatureCollection {
  const coords = buildCircleCoords(station.value.coordinates, radiusKm.value * 1000)
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

function buildExclusionsGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: exclusions.value.map((ex) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [buildCircleCoords(ex.center, ex.radiusM)],
      },
      properties: { id: ex.id, selected: ex.id === selectedExclusion.value ? 'yes' : 'no' },
    })),
  }
}

function buildExclusionCentersGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: exclusions.value.map((ex) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: ex.center },
      properties: { id: ex.id },
    })),
  }
}

function updateExclusionLayers() {
  if (!map) return
  const fillSource = map.getSource('exclusions-fill') as maplibregl.GeoJSONSource | undefined
  const centerSource = map.getSource('exclusion-centers') as maplibregl.GeoJSONSource | undefined
  if (fillSource) fillSource.setData(buildExclusionsGeoJSON())
  if (centerSource) centerSource.setData(buildExclusionCentersGeoJSON())
}

function addExclusion(lngLat: [number, number]) {
  const ex: ExclusionCircle = {
    id: crypto.randomUUID(),
    center: lngLat,
    radiusM: 500,
  }
  exclusions.value.push(ex)
  selectedExclusion.value = ex.id
  updateExclusionLayers()
  persist()
}

function removeExclusion(id: string) {
  const idx = exclusions.value.findIndex((e) => e.id === id)
  if (idx !== -1) exclusions.value.splice(idx, 1)
  if (selectedExclusion.value === id) selectedExclusion.value = null
  updateExclusionLayers()
  persist()
}

function removeAllExclusions() {
  exclusions.value.splice(0, exclusions.value.length)
  selectedExclusion.value = null
  showClearExclModal.value = false
  updateExclusionLayers()
  persist()
}

function updateExclusionRadius(id: string, radiusM: number) {
  const ex = exclusions.value.find((e) => e.id === id)
  if (ex) {
    ex.radiusM = radiusM
    updateExclusionLayers()
    persist()
  }
}

function persist() {
  const center = map ? ([map.getCenter().lng, map.getCenter().lat] as [number, number]) : null
  const zoom = map ? map.getZoom() : 0
  saveState({
    station: selectedStation.value,
    radiusKm: radiusKm.value,
    zoom,
    center,
    exclusions: exclusions.value,
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

function handleMapClick(e: maplibregl.MapMouseEvent) {
  if (placingMode.value) {
    addExclusion([e.lngLat.lng, e.lngLat.lat])
    placingMode.value = false
    return
  }
  if (!map) return
  const features = map.queryRenderedFeatures(e.point, { layers: ['exclusion-centers-layer'] })
  if (features.length > 0) {
    const id = features[0].properties?.id
    if (id) {
      selectedExclusion.value = selectedExclusion.value === id ? null : id
      updateExclusionLayers()
    }
  } else {
    selectedExclusion.value = null
    updateExclusionLayers()
  }
}

function updateMap() {
  if (!map || !mapEl.value) return
  const coords = station.value.coordinates
  const containerWidth = mapEl.value.clientWidth || 400
  const minZoom = getZoomForWidthKm(coords[1], 5, containerWidth)
  const maxZoom = getZoomForWidthKm(coords[1], 0.05, containerWidth)

  map.setMinZoom(minZoom)
  map.setMaxZoom(maxZoom)
  map.setCenter(coords)
  map.setZoom(minZoom)
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

  const initialCenter = savedCenter.value ?? coords
  const initialZoom =
    savedZoom.value > 0 ? Math.max(minZoom, Math.min(maxZoom, savedZoom.value)) : minZoom

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

    // Exclusion circles (red)
    map.addSource('exclusions-fill', { type: 'geojson', data: buildExclusionsGeoJSON() })
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

    // Exclusion center points (for click detection)
    map.addSource('exclusion-centers', { type: 'geojson', data: buildExclusionCentersGeoJSON() })
    map.addLayer({
      id: 'exclusion-centers-layer',
      type: 'circle',
      source: 'exclusion-centers',
      paint: {
        'circle-radius': 12,
        'circle-color': '#dc2626',
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
  })
})

onUnmounted(() => {
  persist()
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

const radiusLabel = computed(() => {
  const m = radiusKm.value * 1000
  return `${Math.round(m)} m`
})

const exclusionRadiusLabel = computed(() => {
  if (!activeExclusion.value) return ''
  const m = activeExclusion.value.radiusM
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
          <button :class="['radius-option', { active: radiusKm === 0.5 }]" @click="radiusKm = 0.5">
            500 m
          </button>
          <button :class="['radius-option', { active: radiusKm === 0.8 }]" @click="radiusKm = 0.8">
            800 m
          </button>
        </div>
      </label>

      <div class="exclusion-controls">
        <div class="excl-btn-row">
          <button
            :class="['excl-btn', { active: placingMode }]"
            @click="placingMode = !placingMode"
          >
            {{ placingMode ? 'Cancel' : '+ Exclusion zone' }}
          </button>
          <button
            v-if="exclusions.length > 0"
            class="excl-btn excl-clear-btn"
            @click="showClearExclModal = true"
          >
            Remove all ({{ exclusions.length }})
          </button>
        </div>

        <div v-if="activeExclusion" class="excl-selected">
          <label class="endgame-field">
            <span class="endgame-label">Exclusion radius: {{ exclusionRadiusLabel }}</span>
            <input
              :value="activeExclusion.radiusM"
              type="range"
              min="0"
              max="2000"
              step="10"
              class="endgame-slider excl-slider"
              @input="
                updateExclusionRadius(
                  activeExclusion!.id,
                  Number(($event.target as HTMLInputElement).value),
                )
              "
            />
          </label>
          <button class="excl-remove-btn" @click="removeExclusion(activeExclusion!.id)">
            Remove
          </button>
        </div>
      </div>
    </div>

    <div class="endgame-map-wrapper">
      <div ref="mapEl" class="endgame-map"></div>
      <canvas ref="rulerCanvas" class="ruler-overlay"></canvas>
      <div v-if="placingMode" class="placing-hint">Tap map to place exclusion zone</div>
    </div>

    <Teleport to="body">
      <div v-if="showClearExclModal" class="overlay" @click.self="showClearExclModal = false">
        <div class="modal">
          <p class="modal-text">Remove all {{ exclusions.length }} exclusion zones?</p>
          <div class="modal-buttons">
            <button class="modal-btn cancel-btn" @click="showClearExclModal = false">Cancel</button>
            <button class="modal-btn confirm-btn" @click="removeAllExclusions">Remove all</button>
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

.excl-clear-btn {
  border-color: #888;
  color: #888;
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
