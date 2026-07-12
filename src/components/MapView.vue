<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore, type MapLayerVisibility } from '../store'
import { stations, lineNames, lineRoutes } from '../stations'

const store = useStore()
const mapEl = ref<HTMLDivElement | null>(null)
const hideCrossedOff = ref(false)
let map: maplibregl.Map | null = null
let popup: maplibregl.Popup | null = null
let popupStation: string | null = null

const pendingCrossOff = ref('')
const showReasonModal = ref(false)
const reasonText = ref('')

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
        <span>${crossed ? 'Crossed off' : 'Available'}</span>
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

function buildGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations
      .filter((s) => !store.favorites.includes(s.name))
      .filter((s) => !(hideCrossedOff.value && stationStatus(s.name) === 'crossed-off'))
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: s.coordinates },
        properties: { name: s.name, status: stationStatus(s.name) },
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
        properties: { name: s.name, status: stationStatus(s.name) },
      })),
  }
}

function buildLinesGeoJSON(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  const stationCoords = new Map(stations.map((s) => [s.name, s.coordinates]))
  for (const lineName of lineNames) {
    const route = lineRoutes[lineName]
    if (!route || route.length < 2) continue
    const coordinates = route
      .map((name) => stationCoords.get(name))
      .filter((c): c is [number, number] => c !== undefined)
    if (coordinates.length < 2) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { line: lineName },
    })
  }
  return { type: 'FeatureCollection', features }
}

onMounted(() => {
  if (!mapEl.value) return

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

    const statusColor: maplibregl.ExpressionSpecification = [
      'match',
      ['get', 'status'],
      'available',
      '#22c55e',
      'crossed-off',
      '#ef4444',
      '#9ca3af',
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
  })
})

onUnmounted(() => {
  popup?.remove()
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
</script>

<template>
  <div class="map-wrapper">
    <div ref="mapEl" class="map-container" />
    <button
      :class="['toggle-btn', { active: hideCrossedOff }]"
      @click="hideCrossedOff = !hideCrossedOff"
    >
      {{ hideCrossedOff ? 'Show all' : 'Hide crossed off' }}
    </button>

    <Teleport to="body">
      <div v-if="showReasonModal" class="overlay" @click.self="cancelMapCrossOff">
        <div class="modal">
          <p class="modal-text">Cross off {{ pendingCrossOff }}?</p>
          <input
            v-model="reasonText"
            type="text"
            class="reason-input"
            placeholder="Reason (e.g. visited, closed…)"
            @keyup.enter="confirmMapCrossOff"
          />
          <div class="modal-buttons">
            <button class="modal-btn cancel-btn" @click="cancelMapCrossOff">Cancel</button>
            <button class="modal-btn confirm-btn" @click="confirmMapCrossOff">Cross off</button>
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

.toggle-btn {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
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
  z-index: 10;
}

.toggle-btn.active {
  background: #0066cc;
  color: #fff;
  border-color: #0066cc;
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
