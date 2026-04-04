<script setup lang="ts">
import { useStore } from '../store'

const store = useStore()

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="history-list">
    <div
      v-for="action in store.actions"
      :key="action.id"
      :class="['history-item', { disabled: !action.enabled }]"
    >
      <label class="history-label">
        <input
          type="checkbox"
          :checked="action.enabled"
          class="history-checkbox"
          @change="store.toggleAction(action.id)"
        />
        <div class="history-info">
          <span class="history-desc">{{ action.description }}</span>
          <span class="history-time">{{ formatTime(action.createdAt) }}</span>
        </div>
      </label>
      <button class="history-remove" @click="store.removeAction(action.id)" title="Remove">
        &times;
      </button>
    </div>
    <div v-if="store.actions.length === 0" class="empty">
      <p>No actions yet.</p>
      <p class="empty-hint">Go to the Actions tab to start eliminating stations.</p>
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
</style>
