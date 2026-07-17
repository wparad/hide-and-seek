<script setup lang="ts">
import { useStore } from './store'
import StationList from './components/StationList.vue'
import HistoryList from './components/HistoryList.vue'
import MapView from './components/MapView.vue'
import ReachabilityTab from './components/ReachabilityTab.vue'
import EndgameTab from './components/EndgameTab.vue'
import SettingsTab from './components/SettingsTab.vue'

const store = useStore()

type Tab = 'map' | 'stations' | 'history' | 'reachability' | 'endgame' | 'settings'

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'map', label: 'Map', icon: '\uD83D\uDDFA\uFE0F' },
  { id: 'stations', label: 'Stations', icon: '\uD83D\uDE89' },
  { id: 'history', label: 'History', icon: '\uD83D\uDCDC' },
  { id: 'reachability', label: 'Reach', icon: '\uD83D\uDEE4\uFE0F' },
  { id: 'endgame', label: 'Endgame', icon: '\uD83C\uDFAF' },
  { id: 'settings', label: 'Settings', icon: '\u2699\uFE0F' },
]
</script>

<template>
  <div class="app">
    <header class="header">
      <h1>Hide &amp; Seek Z&uuml;rich</h1>
      <span class="station-count"
        >{{ store.filteredStations.value.length }} / {{ store.totalStations }} stations</span
      >
    </header>

    <main :class="['content', { 'map-active': store.activeTab === 'map' || store.activeTab === 'endgame' }]">
      <MapView v-if="store.activeTab === 'map'" />
      <StationList v-else-if="store.activeTab === 'stations'" />
      <HistoryList v-else-if="store.activeTab === 'history'" />
      <ReachabilityTab v-else-if="store.activeTab === 'reachability'" />
      <EndgameTab v-else-if="store.activeTab === 'endgame'" />
      <SettingsTab v-else-if="store.activeTab === 'settings'" />
    </main>

    <nav class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab', { active: store.activeTab === tab.id }]"
        @click="store.setTab(tab.id)"
      >
        <span class="tab-icon">{{ tab.icon }}</span>
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f5f5f5;
  color: #1a1a1a;
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-width: 600px;
  margin: 0 auto;
  background: #fff;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e0e0e0;
  background: #fff;
  flex-shrink: 0;
}

.header h1 {
  font-size: 18px;
  font-weight: 700;
}

.station-count {
  font-size: 14px;
  color: #666;
  font-variant-numeric: tabular-nums;
}

.content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  position: relative;
}

.content.map-active {
  overflow: hidden;
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

.tab-bar {
  display: flex;
  border-top: 1px solid #e0e0e0;
  background: #fff;
  flex-shrink: 0;
  padding-bottom: env(safe-area-inset-bottom);
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0 6px;
  border: none;
  background: none;
  color: #999;
  font-size: 11px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color 0.15s;
}

.tab.active {
  color: #0066cc;
}

.tab-icon {
  font-size: 20px;
  margin-bottom: 2px;
}

.tab-label {
  font-weight: 500;
}
</style>
