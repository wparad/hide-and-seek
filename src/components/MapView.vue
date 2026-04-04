<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useStore } from '../store'
import { stations } from '../stations'

const store = useStore()
const mapEl = ref<HTMLDivElement | null>(null)
const hideCrossedOff = ref(false)
let map: maplibregl.Map | null = null
let popup: maplibregl.Popup | null = null
let popupStation: string | null = null

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
  const crossed = store.crossedOff.includes(name)
  const lines = store.getStationLines(name)
  const linesText = lines.length ? lines.join(', ') : 'no line data'
  const query = encodeURIComponent(`${name} Bahnhof ZVV`)
  return `
    <div class="map-popup">
      <div class="map-popup-name">${name}</div>
      <div class="map-popup-lines">${linesText}</div>
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
  if (target instanceof HTMLInputElement && target.dataset.action === 'toggle') {
    if (popupStation) store.toggleStation(popupStation)
  }
}

function refreshPopup() {
  if (!popup || !popupStation) return
  popup.setHTML(buildPopupHTML(popupStation))
  popup.getElement()?.addEventListener('click', onPopupClick)
}

type Status = 'available' | 'crossed-off' | 'filtered-out'

function stationStatus(name: string): Status {
  if (store.crossedOff.includes(name)) return 'crossed-off'
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
  })
})

onUnmounted(() => {
  popup?.remove()
  map?.remove()
  map = null
})

watch(
  [
    () => [...store.crossedOff],
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
</style>

<style>
.map-popup {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 4px 2px;
}

.map-popup-name {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 4px;
}

.map-popup-lines {
  font-size: 12px;
  color: #666;
  margin-bottom: 10px;
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
