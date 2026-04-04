<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../store'

const store = useStore()

const stationList = computed(() =>
  store.filteredStations.value.map((s) => ({
    name: s.name,
    lines: s.lines.join(', ') || 'no line data',
  })),
)
</script>

<template>
  <div class="station-list">
    <div v-for="station in stationList" :key="station.name" class="station-item">
      <span class="station-name">{{ station.name }}</span>
      <span class="station-lines">{{ station.lines }}</span>
    </div>
    <div v-if="stationList.length === 0" class="empty">
      <p>No stations remaining.</p>
      <p class="empty-hint">Check the History tab to re-enable some filters.</p>
    </div>
  </div>
</template>

<style scoped>
.station-list {
  padding: 8px 0;
}

.station-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #f0f0f0;
}

.station-name {
  font-weight: 500;
  font-size: 15px;
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

.empty-hint {
  font-size: 13px;
  margin-top: 8px;
}
</style>
