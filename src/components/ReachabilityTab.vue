<script setup lang="ts">
import { ref, computed } from 'vue'
import { stations } from '../stations'
import { useStore } from '../store'

const store = useStore()
const reach = store.reachability

// Build a lookup map from API stop names to our station list names.
// Keys are normalized (punctuation stripped, lowercased) for fuzzy matching against API responses.
function normalizeStationKey(name: string): string {
  return name
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const apiNameToStation: Map<string, string> = (() => {
  const map = new Map<string, string>()
  for (const s of stations) {
    const key = normalizeStationKey(s.name)
    map.set(key, s.name)
    map.set(`${key} bahnhof`, s.name)
    if (s.apiNames) {
      for (const alias of s.apiNames) {
        const aliasKey = normalizeStationKey(alias)
        map.set(aliasKey, s.name)
        map.set(`${aliasKey} bahnhof`, s.name)
      }
    }
  }
  return map
})()

function resolveStationName(apiName: string): string | undefined {
  return apiNameToStation.get(normalizeStationKey(apiName))
}

const stationQuery = ref(reach.startStation || '')
const showStationDropdown = ref(false)
const isRunning = ref(false)
const error = ref('')
const sortBy = ref<'arrival' | 'station'>('arrival')

function normalizeSearch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function getCurrentTime(): string {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
}

const filteredStationOptions = computed(() => {
  const q = normalizeSearch(stationQuery.value)
  if (!q) return stations
  return stations.filter((s) => normalizeSearch(s.name).includes(q))
})

const unreachableStations = computed(() =>
  stations.filter((s) => !reach.results?.has(s.name) && s.name !== reach.startStation),
)

const sortedReachable = computed(() => {
  if (!reach.results) return []
  const entries = [...reach.results.entries()]
  if (sortBy.value === 'arrival') {
    entries.sort((a, b) => timeToMinutes(a[1].arrivalTime) - timeToMinutes(b[1].arrivalTime))
  } else {
    entries.sort((a, b) => a[0].localeCompare(b[0]))
  }
  return entries
})

function selectStation(name: string) {
  reach.startStation = name
  stationQuery.value = name
  showStationDropdown.value = false
}

function onStationFocus() {
  showStationDropdown.value = true
  stationQuery.value = ''
}

function onStationBlur() {
  setTimeout(() => {
    showStationDropdown.value = false
  }, 150)
}

function onStationInput() {
  showStationDropdown.value = true
}

function isTransferStation(name: string): boolean {
  const lines = store.getStationLines(name)
  return lines.length > 1
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function addMinutes(timeStr: string, mins: number): string {
  const total = timeToMinutes(timeStr) + mins
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function parseISOTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

interface StationboardEntry {
  stop: { departure: string }
  name: string
  number: string
  category: string
  to: string
  passList?: Array<{
    station: { name: string }
    arrival: string | null
    departure: string | null
  }>
}

// Cache to avoid duplicate API calls for same station+time
const apiCache = new Map<string, StationboardEntry[]>()

// The Forchbahn (S18) is classified as tram (T18) in the transport.opendata.ch API.
// For any station on the S18 line, we make a second tram-only call filtered to line 18.
const FORCHBAHN_LINE = 'S18'
const FORCHBAHN_API_NUMBER = '18'

async function fetchStationboard(station: string, datetime: string): Promise<StationboardEntry[]> {
  const cacheKey = `${station}|${datetime}`
  const cached = apiCache.get(cacheKey)
  if (cached) return cached

  const params = new URLSearchParams({
    station,
    datetime,
    limit: '30',
  })
  params.append('transportations[]', 'train')
  const resp = await fetch(`https://transport.opendata.ch/v1/stationboard?${params}`)
  if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`)
  const data = await resp.json()
  let result: StationboardEntry[] = data.stationboard ?? []

  if (store.getStationLines(station).includes(FORCHBAHN_LINE)) {
    const tramParams = new URLSearchParams({
      station,
      datetime,
      limit: '10',
    })
    tramParams.append('transportations[]', 'tram')
    const tramResp = await fetch(`https://transport.opendata.ch/v1/stationboard?${tramParams}`)
    if (tramResp.ok) {
      const tramData = await tramResp.json()
      const forchbahn = (tramData.stationboard ?? []).filter(
        (e: StationboardEntry) => e.number === FORCHBAHN_API_NUMBER,
      )
      result = [...result, ...forchbahn]
    }
  }

  apiCache.set(cacheKey, result)
  return result
}

function getToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`
}

async function run() {
  if (!reach.startStation || !reach.startTime) {
    error.value = 'Enter a station and time'
    return
  }

  isRunning.value = true
  error.value = ''
  reach.results = new Map()
  reach.log = []
  apiCache.clear()

  const deadline = addMinutes(reach.startTime, reach.travelMinutes)
  const deadlineMin = timeToMinutes(deadline)
  const today = getToday()
  const offset = reach.offsetMinutes

  // BFS queue
  const queue: Array<{
    name: string
    arrivalTime: string
    path: string[]
    needsOffset: boolean
  }> = [{ name: reach.startStation, arrivalTime: reach.startTime, path: [], needsOffset: false }]
  const visited = new Set<string>()

  try {
    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.name)) continue
      visited.add(current.name)

      const arrMin = timeToMinutes(current.arrivalTime)
      if (arrMin > deadlineMin) continue

      // Skip stations with no line data — can't determine connectivity
      const lines = store.getStationLines(current.name)
      if (current.name !== reach.startStation && lines.length === 0) {
        reach.log.push(`Skip ${current.name} (no line data)`)
        continue
      }

      // Determine departure window
      const isStart = current.name === reach.startStation
      const effectiveDepartMin = isStart ? arrMin : Math.max(0, arrMin - offset)
      const effectiveDepart = addMinutes('00:00', effectiveDepartMin)

      reach.log.push(`Explore ${current.name} (arr ${current.arrivalTime}, dep ${effectiveDepart})`)

      const datetime = `${today} ${effectiveDepart}`
      const board = await fetchStationboard(current.name, datetime)

      for (const entry of board) {
        if (!entry.stop?.departure) continue
        const depTime = parseISOTime(entry.stop.departure)
        const depMin = timeToMinutes(depTime)
        if (depMin > deadlineMin) continue
        if (depMin < effectiveDepartMin) continue
        if (!entry.passList) continue

        // Is this departure only possible because of the offset?
        const departureNeedsOffset = !isStart && depMin < arrMin

        for (const stop of entry.passList) {
          if (!stop.arrival) continue
          const stopArrival = parseISOTime(stop.arrival)
          const stopArrMin = timeToMinutes(stopArrival)
          if (stopArrMin > deadlineMin) break
          if (stopArrMin < depMin) continue

          const name = resolveStationName(stop.station.name)
          if (!name) continue
          if (visited.has(name)) continue

          // This station needs offset if the current path needed it OR this departure needed it
          const thisNeedsOffset = current.needsOffset || departureNeedsOffset

          const existing = reach.results!.get(name)
          if (!existing || timeToMinutes(existing.arrivalTime) > stopArrMin) {
            // Better path found — update
            const path =
              isTransferStation(current.name) && !isStart
                ? [...current.path, current.name]
                : [...current.path]
            reach.results!.set(name, {
              arrivalTime: stopArrival,
              path,
              needsOffset: thisNeedsOffset,
            })
            queue.push({ name, arrivalTime: stopArrival, path, needsOffset: thisNeedsOffset })
          } else if (existing.needsOffset && !thisNeedsOffset) {
            // Same or worse time, but this path doesn't need offset — clear the flag
            const path =
              isTransferStation(current.name) && !isStart
                ? [...current.path, current.name]
                : [...current.path]
            reach.results!.set(name, {
              arrivalTime: existing.arrivalTime,
              path,
              needsOffset: false,
            })
          }
        }
      }
    }

    reach.log.push(
      `Done. ${reach.results!.size} reachable, ${unreachableStations.value.length} unreachable, ${apiCache.size} API calls`,
    )
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unknown error'
  } finally {
    isRunning.value = false
  }
}

const applyState = ref<'idle' | 'done'>('idle')

function applyToStations() {
  const names = unreachableStations.value.map((s) => s.name)
  store.crossOffAll(names, 'Unreachable (auto)')
  applyState.value = 'done'
  setTimeout(() => {
    store.setTab('map')
    applyState.value = 'idle'
  }, 1200)
}
</script>

<template>
  <div class="reachability-tab">
    <div class="inputs">
      <label>
        Station
        <div class="station-search">
          <input
            v-model="stationQuery"
            type="text"
            class="station-input"
            placeholder="Search station…"
            @focus="onStationFocus"
            @blur="onStationBlur"
            @input="onStationInput"
          />
          <ul v-if="showStationDropdown" class="station-dropdown">
            <li
              v-for="s in filteredStationOptions"
              :key="s.name"
              :class="['station-option', { selected: s.name === reach.startStation }]"
              @mousedown.prevent="selectStation(s.name)"
            >
              {{ s.name }}
            </li>
            <li v-if="filteredStationOptions.length === 0" class="station-option no-results">
              No matches
            </li>
          </ul>
        </div>
      </label>
      <label>
        Depart at
        <div class="time-row">
          <input v-model="reach.startTime" type="time" step="300" />
          <button type="button" class="now-btn" @click="reach.startTime = getCurrentTime()">
            Now
          </button>
        </div>
      </label>
      <div class="row">
        <label class="flex-1">
          Travel time
          <select v-model.number="reach.travelMinutes">
            <option v-for="m in [30, 35, 40, 45, 50, 55, 60, 75, 90]" :key="m" :value="m">
              {{ m }} min
            </option>
          </select>
        </label>
        <label class="flex-1">
          Offset
          <select v-model.number="reach.offsetMinutes">
            <option v-for="m in [0, 2, 3, 5, 8, 10, 15]" :key="m" :value="m">{{ m }} min</option>
          </select>
        </label>
      </div>
      <button :disabled="isRunning" @click="run">
        {{ isRunning ? 'Running...' : 'Find reachable' }}
      </button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="reach.results && reach.results.size > 0" class="results">
      <div class="results-header">
        <h3>Reachable ({{ reach.results.size }})</h3>
        <div class="sort-btns">
          <button :class="{ active: sortBy === 'arrival' }" @click="sortBy = 'arrival'">
            Time
          </button>
          <button :class="{ active: sortBy === 'station' }" @click="sortBy = 'station'">
            Name
          </button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Station</th>
            <th>Arr</th>
            <th>Via</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="[name, info] in sortedReachable" :key="name">
            <td>
              <span v-if="info.needsOffset" class="offset-marker" title="Requires offset">⏰</span>
              {{ name }}
            </td>
            <td>{{ info.arrivalTime }}</td>
            <td class="via">{{ info.path.length > 0 ? info.path.join(' → ') : '—' }}</td>
          </tr>
        </tbody>
      </table>

      <div class="results-header">
        <h3>Unreachable ({{ unreachableStations.length }})</h3>
        <button
          :class="['apply-btn', { 'apply-done': applyState === 'done' }]"
          :disabled="applyState === 'done'"
          @click="applyToStations"
        >
          {{ applyState === 'done' ? '✓ Complete' : 'Apply — mark off unreachable' }}
        </button>
      </div>
      <ul class="unreachable-list">
        <li v-for="s in unreachableStations" :key="s.name">{{ s.name }}</li>
      </ul>
    </div>

    <div v-if="reach.log.length > 0" class="log">
      <details>
        <summary>Log ({{ reach.log.length }} entries)</summary>
        <pre>{{ reach.log.join('\n') }}</pre>
      </details>
    </div>
  </div>
</template>

<style scoped>
.reachability-tab {
  padding: 16px;
  font-size: 14px;
}

.inputs {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.inputs label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-weight: 600;
  font-size: 13px;
}

.inputs select,
.inputs input {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 400;
}

.time-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.time-row input {
  flex: 1;
}

.now-btn {
  padding: 8px 12px;
  background: #f0f0f0;
  color: #333;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.inputs > button {
  padding: 10px;
  background: #0066cc;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.inputs > button:disabled {
  opacity: 0.5;
}

.station-search {
  position: relative;
}

.station-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  font-size: 15px;
  background: #fff;
}

.station-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #d0d0d0;
  border-top: none;
  border-radius: 0 0 6px 6px;
  list-style: none;
  z-index: 20;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  padding: 0;
  margin: 0;
}

.station-option {
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
}

.station-option:hover {
  background: #f0f7ff;
}

.station-option.selected {
  background: #e8f0fe;
  font-weight: 600;
}

.station-option.no-results {
  color: #999;
  cursor: default;
}

.row {
  display: flex;
  gap: 12px;
}

.flex-1 {
  flex: 1;
}

.selected-badge {
  font-size: 12px;
  color: #0066cc;
  font-weight: 400;
}

.error {
  color: #e44;
  margin-bottom: 12px;
}

.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 8px;
}

.results-header h3 {
  font-size: 14px;
  margin: 0;
}

.sort-btns {
  display: flex;
  gap: 4px;
}

.sort-btns button {
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.sort-btns button.active {
  background: #0066cc;
  color: #fff;
  border-color: #0066cc;
}

.apply-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: 6px;
  background: #e44;
  color: #fff;
  cursor: pointer;
  transition:
    background 0.3s,
    transform 0.2s;
}

.apply-btn.apply-done {
  background: #22c55e;
  transform: scale(1.05);
  cursor: default;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid #eee;
}

th {
  font-weight: 600;
  background: #f9f9f9;
}

.offset-marker {
  font-size: 10px;
  margin-right: 2px;
}

.via {
  color: #666;
  font-size: 11px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unreachable-list {
  columns: 2;
  font-size: 13px;
  list-style: none;
  padding: 0;
}

.unreachable-list li {
  padding: 2px 0;
}

.log {
  margin-top: 16px;
}

.log pre {
  font-size: 11px;
  background: #f5f5f5;
  padding: 8px;
  border-radius: 6px;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
}
</style>
