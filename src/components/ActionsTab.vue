<script setup lang="ts">
import { ref } from 'vue'
import { useStore } from '../store'
import { lineNames } from '../stations'

const store = useStore()

const selectedLine = ref(lineNames[0])
const lineMode = ref<'exclude' | 'include'>('exclude')
const characterInput = ref('')
const characterMode = ref<'exclude' | 'include'>('exclude')
const showResetConfirm = ref(false)

function applyLineFilter() {
  const verb = lineMode.value === 'exclude' ? 'Exclude' : 'Keep only'
  store.addAction({
    type: 'line',
    mode: lineMode.value,
    value: selectedLine.value,
    description: `${verb} stations on ${selectedLine.value}`,
  })
}

function applyCharacterFilter() {
  const val = characterInput.value.trim()
  if (!val) return
  const verb = characterMode.value === 'exclude' ? 'Exclude' : 'Keep only'
  store.addAction({
    type: 'character',
    mode: characterMode.value,
    value: val,
    description: `${verb} names containing "${val}"`,
  })
  characterInput.value = ''
}

function confirmReset() {
  store.resetAll()
  showResetConfirm.value = false
}
</script>

<template>
  <div class="actions-tab">
    <section class="action-section">
      <h2>Filter by Line</h2>
      <div class="action-row">
        <select v-model="lineMode" class="action-select">
          <option value="exclude">Exclude</option>
          <option value="include">Keep only</option>
        </select>
        <span class="action-label">stations on</span>
        <select v-model="selectedLine" class="action-select line-select">
          <option v-for="line in lineNames" :key="line" :value="line">{{ line }}</option>
        </select>
      </div>
      <button class="action-btn" @click="applyLineFilter">Apply</button>
    </section>

    <section class="action-section">
      <h2>Filter by Character</h2>
      <div class="action-row">
        <select v-model="characterMode" class="action-select">
          <option value="exclude">Exclude</option>
          <option value="include">Keep only</option>
        </select>
        <span class="action-label">names containing</span>
        <input
          v-model="characterInput"
          class="action-input"
          type="text"
          placeholder="e.g. &uuml;"
          @keyup.enter="applyCharacterFilter"
        />
      </div>
      <button class="action-btn" @click="applyCharacterFilter">Apply</button>
    </section>

    <section class="action-section danger-section">
      <button class="action-btn danger-btn" @click="showResetConfirm = true">
        Reset Everything
      </button>
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

.action-section {
  margin-bottom: 24px;
}

.action-section h2 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 10px;
  color: #333;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.action-label {
  font-size: 14px;
  color: #666;
}

.action-select,
.action-input {
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
  color: #1a1a1a;
}

.line-select {
  min-width: 80px;
}

.action-input {
  flex: 1;
  min-width: 80px;
}

.action-btn {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  background: #0066cc;
  color: #fff;
  transition: background 0.15s;
}

.action-btn:active {
  background: #0052a3;
}

.danger-section {
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
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
</style>
