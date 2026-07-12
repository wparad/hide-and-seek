<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore } from '../store'
import { stations, lineNames } from '../stations'

const store = useStore()

const filterLine = ref('')
const filterStatus = ref<'all' | 'available' | 'crossed-off'>('all')
const filterText = ref('')
const filterCharCount = ref(0)
const editingStation = ref<string | null>(null)
const editingLines = ref<string[]>([])

const showReasonModal = ref(false)
const pendingStation = ref('')
const reasonText = ref('')

const maxCharCount = computed(() => Math.max(...stations.map((s) => s.name.length)))

const visibleStations = computed(() => {
  let result = stations

  if (filterLine.value) {
    result = result.filter((s) => store.getStationLines(s.name).includes(filterLine.value))
  }

  if (filterStatus.value === 'available') {
    result = result.filter((s) => !(s.name in store.crossedOff))
  } else if (filterStatus.value === 'crossed-off') {
    result = result.filter((s) => s.name in store.crossedOff)
  }

  if (filterText.value) {
    // Plain vowels in the query match their umlaut equivalents (a→ä, o→ö, u→ü),
    // but umlauts in the query only match themselves.
    const pattern = filterText.value
      .toLowerCase()
      .replace(/a/g, '[aä]')
      .replace(/o/g, '[oö]')
      .replace(/u/g, '[uü]')
    const re = new RegExp(pattern)
    result = result.filter((s) => re.test(s.name.toLowerCase()))
  }

  if (filterCharCount.value > 0) {
    result = result.filter((s) => s.name.length === filterCharCount.value)
  }

  if (store.hideNoLineData) {
    result = result.filter((s) => store.getStationLines(s.name).length > 0)
  }

  return result
})

const availableCount = computed(() => stations.filter((s) => !(s.name in store.crossedOff)).length)

function isCrossedOff(name: string) {
  return name in store.crossedOff
}

function handleStationClick(name: string) {
  if (name in store.crossedOff) {
    store.toggleStation(name)
    return
  }
  pendingStation.value = name
  reasonText.value = ''
  showReasonModal.value = true
}

function confirmCrossOff() {
  store.toggleStation(pendingStation.value, reasonText.value || 'Manual')
  showReasonModal.value = false
  pendingStation.value = ''
  reasonText.value = ''
}

function cancelCrossOff() {
  showReasonModal.value = false
  pendingStation.value = ''
  reasonText.value = ''
}

function openLineEditor(name: string) {
  if (editingStation.value === name) {
    editingStation.value = null
    return
  }
  editingStation.value = name
  editingLines.value = [...store.getStationLines(name)]
}

function toggleLineChip(line: string) {
  const idx = editingLines.value.indexOf(line)
  if (idx === -1) {
    editingLines.value.push(line)
  } else {
    editingLines.value.splice(idx, 1)
  }
}

function saveLines() {
  if (editingStation.value) {
    store.setStationLines(editingStation.value, [...editingLines.value])
    editingStation.value = null
  }
}
</script>

<template>
  <div class="station-list">
    <div class="filter-bar">
      <select v-model="filterLine" class="filter-select">
        <option value="">All lines</option>
        <option v-for="line in lineNames" :key="line" :value="line">{{ line }}</option>
      </select>
      <select v-model="filterStatus" class="filter-select">
        <option value="all">All</option>
        <option value="available">Available</option>
        <option value="crossed-off">Crossed off</option>
      </select>
      <input v-model="filterText" class="filter-input" type="text" placeholder="Search name…" />
    </div>

    <div class="char-filter" v-if="filterCharCount > 0 || true">
      <label class="char-label">
        Name length: {{ filterCharCount === 0 ? 'any' : filterCharCount }}
      </label>
      <input
        type="range"
        class="char-slider"
        v-model.number="filterCharCount"
        :min="0"
        :max="maxCharCount"
      />
    </div>

    <div class="count-bar">
      {{ availableCount }} / {{ stations.length }} available
      <span v-if="visibleStations.length !== stations.length" class="count-filtered">
        · {{ visibleStations.length }} shown
      </span>
    </div>

    <template v-for="station in visibleStations" :key="station.name">
      <div
        :class="['station-item', { 'crossed-off': isCrossedOff(station.name) }]"
        @click="handleStationClick(station.name)"
      >
        <input
          type="checkbox"
          class="station-checkbox"
          :checked="!isCrossedOff(station.name)"
          @click.stop="handleStationClick(station.name)"
        />
        <span class="station-name">{{ station.name }}</span>
        <span class="station-lines">
          {{ store.getStationLines(station.name).join(', ') || 'no line data' }}
        </span>
        <button
          class="fav-btn"
          :class="{ active: store.favorites.includes(station.name) }"
          @click.stop="store.toggleFavorite(station.name)"
        >
          {{ store.favorites.includes(station.name) ? '★' : '☆' }}
        </button>
        <button class="edit-lines-btn" @click.stop="openLineEditor(station.name)">✏️</button>
      </div>
      <div v-if="editingStation === station.name" class="line-editor" @click.stop>
        <div class="line-chips">
          <button
            v-for="line in lineNames"
            :key="line"
            :class="['line-chip', { active: editingLines.includes(line) }]"
            @click="toggleLineChip(line)"
          >
            {{ line }}
          </button>
        </div>
        <button class="line-editor-done" @click="saveLines()">Done</button>
      </div>
    </template>

    <div v-if="visibleStations.length === 0" class="empty">
      <p>No stations match filters.</p>
    </div>

    <Teleport to="body">
      <div v-if="showReasonModal" class="overlay" @click.self="cancelCrossOff">
        <div class="modal">
          <p class="modal-text">Cross off {{ pendingStation }}?</p>
          <input
            v-model="reasonText"
            type="text"
            class="reason-input"
            placeholder="Reason (e.g. visited, closed…)"
            @keyup.enter="confirmCrossOff"
          />
          <div class="modal-buttons">
            <button class="modal-btn cancel-btn" @click="cancelCrossOff">Cancel</button>
            <button class="modal-btn confirm-btn" @click="confirmCrossOff">Cross off</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.station-list {
  padding: 0;
}

.filter-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
  position: sticky;
  top: 0;
  z-index: 10;
}

.filter-select,
.filter-input {
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
  color: #1a1a1a;
}

.filter-select {
  flex-shrink: 0;
}

.filter-input {
  flex: 1;
  min-width: 0;
}

.count-bar {
  padding: 8px 16px;
  font-size: 13px;
  color: #666;
  border-bottom: 1px solid #f0f0f0;
  font-variant-numeric: tabular-nums;
}

.count-filtered {
  color: #999;
}

.station-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.1s;
}

.station-item:active {
  background: #f5f5f5;
}

.station-item.crossed-off {
  opacity: 0.45;
}

.station-item.crossed-off .station-name {
  text-decoration: line-through;
}

.station-checkbox {
  width: 20px;
  height: 20px;
  margin-right: 12px;
  flex-shrink: 0;
  accent-color: #0066cc;
  cursor: pointer;
}

.station-name {
  font-weight: 500;
  font-size: 15px;
  flex: 1;
  min-width: 0;
}

.station-lines {
  font-size: 12px;
  color: #888;
  flex-shrink: 0;
  margin-left: 12px;
}

.char-filter {
  padding: 8px 16px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
}

.char-label {
  font-size: 13px;
  color: #666;
  display: block;
  margin-bottom: 4px;
}

.char-slider {
  width: 100%;
  accent-color: #0066cc;
}

.fav-btn {
  background: none;
  border: none;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 18px;
  flex-shrink: 0;
  color: #ccc;
  -webkit-tap-highlight-color: transparent;
  line-height: 1;
}

.fav-btn.active {
  color: #f59e0b;
}

.edit-lines-btn {
  background: none;
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 14px;
  flex-shrink: 0;
  opacity: 0.5;
  -webkit-tap-highlight-color: transparent;
}

.edit-lines-btn:hover {
  opacity: 1;
}

.line-editor {
  padding: 8px 16px 12px;
  border-bottom: 1px solid #f0f0f0;
  background: #f8f8f8;
}

.line-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.line-chip {
  padding: 4px 10px;
  border: 1px solid #ccc;
  border-radius: 14px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    background 0.1s,
    border-color 0.1s;
}

.line-chip.active {
  background: #0066cc;
  color: #fff;
  border-color: #0066cc;
}

.line-editor-done {
  padding: 6px 16px;
  background: #0066cc;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 16px;
  color: #999;
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
