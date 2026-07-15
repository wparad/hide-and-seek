<script setup lang="ts">
import { ref } from 'vue'
import { useStore, type MapLayerVisibility } from '../store'

const buildSha = __BUILD_SHA__
const buildDate = __BUILD_DATE__

const store = useStore()

const showResetConfirm = ref(false)

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
  <div class="actions-tab">
    <section class="action-section">
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
    </section>

    <section class="action-section">
      <div class="btn-row">
        <button class="action-btn" @click="checkAll">Mark off all</button>
        <button class="action-btn secondary-btn" @click="store.restoreAll()">Unmark all</button>
      </div>
    </section>

    <section class="action-section">
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

    <section class="action-section danger-section">
      <button class="action-btn danger-btn" @click="showResetConfirm = true">
        Reset Everything
      </button>
    </section>

    <section class="build-info">
      <span>{{ buildSha }} · {{ buildDate }}</span>
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
.actions-tab {
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
  font-size: 14px;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.action-section {
  margin-bottom: 24px;
}

.danger-section {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
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
}
</style>
