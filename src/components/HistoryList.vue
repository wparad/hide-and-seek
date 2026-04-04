<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../store'
import type { GameAction } from '../store'
import type { StationEvent } from '../store'

const store = useStore()

type HistoryEntry = { kind: 'action'; item: GameAction } | { kind: 'station'; item: StationEvent }

const entries = computed((): HistoryEntry[] => {
  const actions: HistoryEntry[] = store.actions.map((a) => ({ kind: 'action', item: a }))
  const events: HistoryEntry[] = store.stationHistory.map((e) => ({ kind: 'station', item: e }))
  return [...actions, ...events].sort((a, b) => b.item.createdAt - a.item.createdAt)
})

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="history-list">
    <template v-for="entry in entries" :key="entry.item.id">
      <!-- Filter action -->
      <div
        v-if="entry.kind === 'action'"
        :class="['history-item', { disabled: !entry.item.enabled }]"
      >
        <label class="history-label">
          <input
            type="checkbox"
            :checked="entry.item.enabled"
            class="history-checkbox"
            @change="store.toggleAction(entry.item.id)"
          />
          <div class="history-info">
            <span class="history-desc">{{ entry.item.description }}</span>
            <span class="history-time">{{ formatTime(entry.item.createdAt) }}</span>
          </div>
        </label>
        <button class="history-remove" @click="store.removeAction(entry.item.id)" title="Remove">
          &times;
        </button>
      </div>

      <!-- Station check/uncheck event -->
      <div v-else class="history-item station-event">
        <div class="station-event-icon">{{ entry.item.type === 'cross-off' ? '✓' : '↩' }}</div>
        <div class="history-info">
          <span class="history-desc">{{ entry.item.name }}</span>
          <span class="history-time">
            {{ entry.item.type === 'cross-off' ? 'crossed off' : 'restored' }} ·
            {{ formatTime(entry.item.createdAt) }}
          </span>
        </div>
        <button
          class="history-remove"
          @click="store.removeStationEvent(entry.item.id)"
          title="Remove"
        >
          &times;
        </button>
      </div>
    </template>

    <div v-if="entries.length === 0" class="empty">
      <p>No history yet.</p>
      <p class="empty-hint">Cross off stations or add filters to see history here.</p>
    </div>
  </div>
</template>

<style scoped>
.history-list {
  padding: 8px 0;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid #f0f0f0;
  transition: opacity 0.15s;
}

.history-item.disabled {
  opacity: 0.45;
}

.history-label {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 12px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.history-checkbox {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: #0066cc;
}

.history-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-desc {
  font-size: 14px;
  font-weight: 500;
}

.history-time {
  font-size: 11px;
  color: #999;
}

.history-remove {
  border: none;
  background: none;
  font-size: 20px;
  color: #ccc;
  cursor: pointer;
  padding: 4px 8px;
  -webkit-tap-highlight-color: transparent;
}

.history-remove:hover {
  color: #e44;
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

.station-event {
  background: #fafafa;
}

.station-event-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0066cc;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
}
</style>
