<script setup lang="ts">
import { ref, computed } from 'vue'
import { stations } from '../stations'
import { useStore } from '../store'

const store = useStore()
const reach = store.reachability

const stationQuery = ref('')
const isRunning = ref(false)
const error = ref('')
const sortBy = ref<'arrival' | 'station'>('arrival')

function getCurrentTime(): string {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
}

const filteredStationOptions = computed(() => {
  const q = stationQuery.value.toLowerCase().trim()
  const names = stations.map((s) => s.name).sort()
  if (!q) return names
  return names.filter((n) => n.toLowerCase().includes(q))
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

async function fetchStationboard(station: string, datetime: string): Promise<StationboardEntry[]> {
  const cacheKey = `${station}|${datetime}`
  const cached = apiCache.get(cacheKey)
  if (cached) return cached

  const params = new URLSearchParams({
    station,
    datetime,
    limit: '30',
    'transportations[]': 'train',
  })
  const resp = await fetch(`https://transport.opendata.ch/v1/stationboard?${params}`)
  if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`)
  const data = await resp.json()
  const result: StationboardEntry[] = data.stationboard ?? []
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

      // Skip single-line stations — no transfers possible, already marked reachable
      if (current.name !== reach.startStation && !isTransferStation(current.name)) {
        reach.log.push(`Skip ${current.name} (single line)`)
        continue
      }

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

          const name = stop.station.name
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

function applyToStations() {
  const names = unreachableStations.value.map((s) => s.name)
  store.crossOffAll(names, 'Unreachable (auto)')
}
</script>

<template>
  <div class="reachability-tab">
    <div class="inputs">
      <label>
        Station
        <input
          v-model="stationQuery"
          type="text"
          placeholder="Type to search..."
          list="station-options"
          @change="selectStation(stationQuery)"
        />
        <datalist id="station-options">
          <option v-for="name in filteredStationOptions" :key="name" :value="name" />
        </datalist>
        <span v-if="reach.startStation" class="selected-badge">{{ reach.startStation }}</span>
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
        <button class="apply-btn" @click="applyToStations">Apply — cross off unreachable</button>
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
