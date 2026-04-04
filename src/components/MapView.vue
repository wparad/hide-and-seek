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

    map.addLayer({
      id: 'stations-layer',
      type: 'circle',
      source: 'stations',
      paint: {
        'circle-radius': ['match', ['get', 'status'], 'filtered-out', 5, 8],
        'circle-color': [
          'match',
          ['get', 'status'],
          'available',
          '#22c55e',
          'crossed-off',
          '#ef4444',
          '#9ca3af',
        ],
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

    map.on('click', 'stations-layer', (e) => {
      const name = e.features?.[0]?.properties?.name
      if (name) store.toggleStation(name)
    })

    map.on('mouseenter', 'stations-layer', () => {
      if (map) map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'stations-layer', () => {
      if (map) map.getCanvas().style.cursor = ''
    })
  })
})

onUnmounted(() => {
  map?.remove()
  map = null
})

watch([() => [...store.crossedOff], () => store.filteredStations.value, hideCrossedOff], () => {
  const source = map?.getSource('stations') as maplibregl.GeoJSONSource | undefined
  source?.setData(buildGeoJSON())
})
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
