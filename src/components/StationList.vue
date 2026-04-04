<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore } from '../store'
import { stations, lineNames } from '../stations'

const store = useStore()

const filterLine = ref('')
const filterStatus = ref<'all' | 'available' | 'crossed-off'>('all')
const filterText = ref('')

const visibleStations = computed(() => {
  let result = stations

  if (filterLine.value) {
    result = result.filter((s) => s.lines.includes(filterLine.value))
  }

  if (filterStatus.value === 'available') {
    result = result.filter((s) => !store.crossedOff.includes(s.name))
  } else if (filterStatus.value === 'crossed-off') {
    result = result.filter((s) => store.crossedOff.includes(s.name))
  }

  if (filterText.value) {
    const lower = filterText.value.toLowerCase()
    result = result.filter((s) => s.name.toLowerCase().includes(lower))
  }

  return result
})

const availableCount = computed(
  () => stations.filter((s) => !store.crossedOff.includes(s.name)).length,
)

function isCrossedOff(name: string) {
  return store.crossedOff.includes(name)
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

    <div class="count-bar">
      {{ availableCount }} / {{ stations.length }} available
      <span v-if="visibleStations.length !== stations.length" class="count-filtered">
        · {{ visibleStations.length }} shown
      </span>
    </div>

    <div
      v-for="station in visibleStations"
      :key="station.name"
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
      <span class="station-lines">{{ station.lines.join(', ') || 'no line data' }}</span>
    </div>

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

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 16px;
  color: #999;
}
</style>
