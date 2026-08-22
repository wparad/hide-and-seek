<script setup lang="ts">
import { toasts, dismissToast } from '../toast'
</script>

<template>
  <div class="toast-host">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      :class="['toast', toast.type]"
      @click="dismissToast(toast.id)"
    >
      {{ toast.message }}
    </div>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: calc(72px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 500;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 90%;
  max-width: 480px;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  text-align: center;
  cursor: pointer;
}

.toast.success {
  background: #22c55e;
}

.toast.error {
  background: #dc2626;
}
</style>
