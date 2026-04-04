<script setup lang="ts">
import { ref } from 'vue'
import { useStore } from '../store'

const store = useStore()

const showResetConfirm = ref(false)

function checkAll() {
  store.crossOffAll(store.filteredStations.value.map((s) => s.name))
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
    </section>

    <section class="action-section">
      <div class="btn-row">
        <button class="action-btn" @click="checkAll">Check all</button>
        <button class="action-btn secondary-btn" @click="store.restoreAll()">Uncheck all</button>
      </div>
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

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.toggle-row input[type='checkbox'] {
  width: 20px;
  height: 20px;
  accent-color: #0066cc;
  cursor: pointer;
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
</style>
