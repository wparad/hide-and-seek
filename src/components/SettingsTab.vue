<script setup lang="ts">
import { ref } from 'vue'
import { useStore, type MapLayerVisibility } from '../store'

const buildSha = __BUILD_SHA__
const buildDate = __BUILD_DATE__
const buildNumber = __BUILD_NUMBER__

const localBuildDate = (() => {
  const d = new Date(buildDate)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
})()

const store = useStore()

const showResetConfirm = ref(false)

async function clearMapCache() {
  const deleted = await caches.delete('map-tiles')
  if (deleted) {
    alert('Map cache cleared')
  }
}

const mapLayerLabels: { key: keyof MapLayerVisibility; label: string }[] = [
  { key: 'roads', label: 'Roads & highways' },
  { key: 'rail', label: 'Rail lines' },
  { key: 'labels', label: 'Place labels' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'poi', label: 'Points of interest' },
  { key: 'boundaries', label: 'Boundaries' },
  { key: 'water', label: 'Water' },
  { key: 'landuse', label: 'Land use & parks' },
]

function checkAll() {
  store.crossOffAll(
    store.filteredStations.value.map((s) => s.name),
    'Bulk cross-off',
  )
}

function confirmReset() {
  store.resetAll()
  showResetConfirm.value = false
}
</script>

<template>
  <div class="settings-tab">
    <!-- Admin section -->
    <section class="settings-section">
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="store.hideNoLineData"
          @change="store.toggleHideNoLineData()"
        />
        <span>Hide stations with no line data</span>
      </label>
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="store.showStationLabels"
          @change="store.toggleShowStationLabels()"
        />
        <span>Show station labels on map</span>
      </label>
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="store.flexibleHidingZone"
          @change="store.toggleFlexibleHidingZone()"
        />
        <span>Flexible hiding zone radius (advanced)</span>
      </label>
    </section>

    <section class="settings-section">
      <div class="btn-row">
        <button class="action-btn" @click="checkAll">Mark off all</button>
        <button class="action-btn secondary-btn" @click="store.restoreAll()">Unmark all</button>
      </div>
    </section>

    <section class="settings-section">
      <h3 class="section-title">Map layers</h3>
      <label v-for="layer in mapLayerLabels" :key="layer.key" class="toggle-row">
        <input
          type="checkbox"
          :checked="store.mapLayers[layer.key]"
          @change="store.toggleMapLayer(layer.key)"
        />
        <span>{{ layer.label }}</span>
      </label>
    </section>

    <section class="settings-section danger-section">
      <button class="action-btn danger-btn" @click="showResetConfirm = true">
        Reset Everything
      </button>
      <button class="action-btn secondary-btn" style="margin-top: 12px" @click="clearMapCache">
        Clear map cache
      </button>
    </section>

    <!-- Divider -->
    <hr class="divider" />

    <!-- Links section -->
    <section class="links-section">
      <h2 class="section-title">ZVV</h2>
      <a
        class="link-item"
        href="https://github.com/wparad/hide-and-seek/blob/main/data/all.pdf?raw=true"
        target="_blank"
        rel="noopener"
      >
        <span class="link-label">Official Map (To Scale)</span>
        <span class="link-arrow">→</span>
      </a>
      <a
        class="link-item"
        href="https://github.com/wparad/hide-and-seek/blob/main/data/zvv.pdf?raw=true"
        target="_blank"
        rel="noopener"
      >
        <span class="link-label">Transit Map — Readable</span>
        <span class="link-arrow">→</span>
      </a>
    </section>

    <section class="links-section">
      <h2 class="section-title">Tools</h2>
      <a class="link-item" href="https://overpass-turbo.osm.ch/#" target="_blank" rel="noopener">
        <span class="link-label">Overpass Turbo (OSM)</span>
        <span class="link-arrow">→</span>
      </a>
      <a
        class="link-item"
        href="https://online.fahrplaninfo.zvv.ch/frame_hst3.php?lang=en&hstNr=11347&hstName="
        target="_blank"
        rel="noopener"
      >
        <span class="link-label">Line/Station Validator</span>
        <span class="link-arrow">→</span>
      </a>
      <a
        class="link-item"
        href="https://github.com/wparad/hide-and-seek"
        target="_blank"
        rel="noopener"
      >
        <span class="link-label">GitHub Repository</span>
        <span class="link-arrow">→</span>
      </a>
    </section>

    <footer class="attribution">
      Map data ©
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"
        >OpenStreetMap</a
      >
      contributors. Tiles by
      <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>.
    </footer>

    <section class="build-info">
      <div><span class="build-label">Build:</span> #{{ buildNumber }}</div>
      <div><span class="build-label">Commit:</span> {{ buildSha }}</div>
      <div><span class="build-label">Built:</span> {{ localBuildDate }}</div>
    </section>

    <Teleport to="body">
      <div v-if="showResetConfirm" class="overlay" @click.self="showResetConfirm = false">
        <div class="modal">
          <p class="modal-text">Remove all filters and start over?</p>
          <div class="modal-buttons">
            <button class="modal-btn cancel-btn" @click="showResetConfirm = false">Cancel</button>
            <button class="modal-btn confirm-btn" @click="confirmReset">Reset</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.settings-tab {
  padding: 16px;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  margin-bottom: 10px;
}

.toggle-row:last-child {
  margin-bottom: 0;
}

.toggle-row input[type='checkbox'] {
  width: 20px;
  height: 20px;
  accent-color: #0066cc;
  cursor: pointer;
}

.section-title {
  font-size: 12px;
  font-weight: 700;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 12px;
}

.settings-section {
  margin-bottom: 24px;
}

.danger-section {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
}

.divider {
  border: none;
  border-top: 2px solid #e0e0e0;
  margin: 32px 0;
}

.btn-row {
  display: flex;
  gap: 12px;
}

.action-btn {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  background: #0066cc;
  color: #fff;
  -webkit-tap-highlight-color: transparent;
}

.action-btn:active {
  background: #0052a3;
}

.secondary-btn {
  background: #f0f0f0;
  color: #333;
}

.secondary-btn:active {
  background: #e0e0e0;
}

.danger-btn {
  background: #e44;
}

.danger-btn:active {
  background: #c33;
}

.links-section {
  margin-bottom: 24px;
}

.link-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 12px;
  background: #f5f5f5;
  border-radius: 8px;
  text-decoration: none;
  color: #1a1a1a;
  font-size: 15px;
  margin-bottom: 8px;
  -webkit-tap-highlight-color: transparent;
}

.link-item:active {
  background: #ebebeb;
}

.link-arrow {
  color: #999;
  font-size: 16px;
}

.attribution {
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
  font-size: 11px;
  color: #999;
  line-height: 1.6;
}

.attribution a {
  color: #666;
  text-decoration: underline;
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

.build-info {
  margin-top: 24px;
  text-align: center;
  font-size: 11px;
  color: #aaa;
  line-height: 1.8;
}

.build-label {
  font-weight: 600;
  color: #999;
}
</style>
