<script setup lang="ts">
import { ref } from 'vue'
import CardsPanel from './CardsPanel.vue'
import QuestionsPanel from './QuestionsPanel.vue'

const mode = ref<'questions' | 'cards'>('questions')
</script>

<template>
  <div class="rules-tab">
    <div class="rules-header">
      <div class="mode-toggle">
        <button :class="['mode-btn', { active: mode === 'questions' }]" @click="mode = 'questions'">
          Questions
        </button>
        <button :class="['mode-btn', { active: mode === 'cards' }]" @click="mode = 'cards'">
          Cards
        </button>
      </div>
    </div>

    <div class="rules-content">
      <div v-if="mode === 'questions'">
        <QuestionsPanel />
      </div>
      <div v-else>
        <CardsPanel />
      </div>
    </div>
  </div>
</template>

<style scoped>
.rules-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.rules-header {
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.rules-search {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  font-size: 15px;
  background: #fff;
}

.mode-toggle {
  display: flex;
  gap: 0;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  overflow: hidden;
}

.mode-btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  background: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: #666;
}

.mode-btn.active {
  background: #0066cc;
  color: #fff;
}

.rules-content {
  flex: 1;
  overflow-y: auto;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
}

.placeholder-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
</style>
