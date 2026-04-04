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

const maxCharCount = computed(() => Math.max(...stations.map((s) => s.name.length)))

const visibleStations = computed(() => {
  let result = stations

  if (filterLine.value) {
    result = result.filter((s) => store.getStationLines(s.name).includes(filterLine.value))
  }

  if (filterStatus.value === 'available') {
    result = result.filter((s) => !store.crossedOff.includes(s.name))
  } else if (filterStatus.value === 'crossed-off') {
    result = result.filter((s) => store.crossedOff.includes(s.name))
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

const availableCount = computed(
  () => stations.filter((s) => !store.crossedOff.includes(s.name)).length,
)

function isCrossedOff(name: string) {
  return store.crossedOff.includes(name)
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
        @click="store.toggleStation(station.name)"
      >
        <input
          type="checkbox"
          class="station-checkbox"
          :checked="!isCrossedOff(station.name)"
          @click.stop="store.toggleStation(station.name)"
        />
        <span class="station-name">{{ station.name }}</span>
        <span class="station-lines">
          {{ store.getStationLines(station.name).join(', ') || 'no line data' }}
        </span>
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
</style>
