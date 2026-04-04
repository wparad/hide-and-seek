import { reactive, computed } from 'vue'
import { stations, type Station } from './stations'

export type TabId = 'map' | 'stations' | 'history' | 'actions'

export interface GameAction {
  id: string
  type: 'line' | 'character'
  mode: 'include' | 'exclude'
  value: string
  description: string
  enabled: boolean
  createdAt: number
}

export interface StationEvent {
  id: string
  name: string
  type: 'cross-off' | 'restore'
  createdAt: number
}

interface GameState {
  actions: GameAction[]
  activeTab: TabId
  crossedOff: string[]
  favorites: string[]
  lineOverrides: Record<string, string[]>
  hideNoLineData: boolean
  stationHistory: StationEvent[]
}

const STORAGE_KEY = 'hide-and-seek-zurich'

// Ordinal ID = index in the stations array
function namesToIds(names: string[]): number[] {
  return names.map((name) => stations.findIndex((s) => s.name === name)).filter((i) => i !== -1)
}

function idsToNames(ids: number[]): string[] {
  return ids.map((i) => stations[i]?.name).filter(Boolean) as string[]
}

function crossedOffFromUrl(): string[] | null {
  const param = new URLSearchParams(window.location.search).get('c')
  if (!param) return null
  const ids = param
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < stations.length)
  return idsToNames(ids)
}

function syncUrl(crossedOff: string[]) {
  const url = new URL(window.location.href)
  if (crossedOff.length === 0) {
    url.searchParams.delete('c')
  } else {
    url.searchParams.set('c', namesToIds(crossedOff).join(','))
  }
  history.replaceState(null, '', url)
}

function loadState(): GameState {
  const fromUrl = crossedOffFromUrl()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as GameState
      return {
        actions: parsed.actions ?? [],
        activeTab: parsed.activeTab ?? 'stations',
        crossedOff: fromUrl ?? parsed.crossedOff ?? [],
        favorites: parsed.favorites ?? [],
        lineOverrides: parsed.lineOverrides ?? {},
        hideNoLineData: parsed.hideNoLineData ?? false,
        stationHistory: parsed.stationHistory ?? [],
      }
    }
  } catch {
    // corrupted storage — start fresh
  }
  return {
    actions: [],
    activeTab: 'stations',
    crossedOff: fromUrl ?? [],
    favorites: [],
    lineOverrides: {},
    hideNoLineData: false,
    stationHistory: [],
  }
}

function saveState(state: GameState) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      actions: state.actions,
      activeTab: state.activeTab,
      crossedOff: state.crossedOff,
      favorites: state.favorites,
      lineOverrides: state.lineOverrides,
      hideNoLineData: state.hideNoLineData,
      stationHistory: state.stationHistory,
    }),
  )
}

function applyActions(
  allStations: Station[],
  actions: GameAction[],
  lineOverrides: Record<string, string[]>,
): Station[] {
  let result = allStations
  for (const action of actions) {
    if (!action.enabled) continue
    if (action.type === 'line') {
      if (action.mode === 'exclude') {
        result = result.filter((s) => !(lineOverrides[s.name] ?? s.lines).includes(action.value))
      } else {
        result = result.filter((s) => (lineOverrides[s.name] ?? s.lines).includes(action.value))
      }
    } else if (action.type === 'character') {
      const lower = action.value.toLowerCase()
      if (action.mode === 'exclude') {
        result = result.filter((s) => !s.name.toLowerCase().includes(lower))
      } else {
        result = result.filter((s) => s.name.toLowerCase().includes(lower))
      }
    }
  }
  return result
}

function createStore() {
  const initial = loadState()
  const state = reactive<GameState>(initial)

  const filteredStations = computed(() =>
    applyActions(stations, state.actions, state.lineOverrides),
  )
  const totalStations = stations.length

  function persist() {
    saveState(state)
    syncUrl(state.crossedOff)
  }

  function addAction(action: Omit<GameAction, 'id' | 'enabled' | 'createdAt'>) {
    state.actions.push({
      ...action,
      id: crypto.randomUUID(),
      enabled: true,
      createdAt: Date.now(),
    })
    persist()
  }

  function toggleAction(id: string) {
    const action = state.actions.find((a) => a.id === id)
    if (action) {
      action.enabled = !action.enabled
      persist()
    }
  }

  function removeAction(id: string) {
    const idx = state.actions.findIndex((a) => a.id === id)
    if (idx !== -1) {
      state.actions.splice(idx, 1)
      persist()
    }
  }

  function toggleStation(name: string) {
    const idx = state.crossedOff.indexOf(name)
    const type: StationEvent['type'] = idx === -1 ? 'cross-off' : 'restore'
    if (idx === -1) {
      state.crossedOff.push(name)
    } else {
      state.crossedOff.splice(idx, 1)
    }
    state.stationHistory.push({ id: crypto.randomUUID(), name, type, createdAt: Date.now() })
    persist()
  }

  function crossOffAll(names: string[]) {
    const now = Date.now()
    for (const name of names) {
      if (!state.crossedOff.includes(name)) {
        state.crossedOff.push(name)
        state.stationHistory.push({
          id: crypto.randomUUID(),
          name,
          type: 'cross-off',
          createdAt: now,
        })
      }
    }
    persist()
  }

  function restoreAll() {
    const now = Date.now()
    for (const name of [...state.crossedOff]) {
      state.stationHistory.push({ id: crypto.randomUUID(), name, type: 'restore', createdAt: now })
    }
    state.crossedOff.splice(0, state.crossedOff.length)
    persist()
  }

  function removeStationEvent(id: string) {
    const idx = state.stationHistory.findIndex((e) => e.id === id)
    if (idx !== -1) state.stationHistory.splice(idx, 1)
    persist()
  }

  function setStationLines(name: string, lines: string[]) {
    state.lineOverrides[name] = lines
    persist()
  }

  function getStationLines(name: string): string[] {
    return state.lineOverrides[name] ?? stations.find((s) => s.name === name)?.lines ?? []
  }

  function toggleFavorite(name: string) {
    const idx = state.favorites.indexOf(name)
    if (idx === -1) {
      state.favorites.push(name)
    } else {
      state.favorites.splice(idx, 1)
    }
    persist()
  }

  function toggleHideNoLineData() {
    state.hideNoLineData = !state.hideNoLineData
    persist()
  }

  function resetAll() {
    state.actions.splice(0, state.actions.length)
    state.crossedOff.splice(0, state.crossedOff.length)
    Object.keys(state.lineOverrides).forEach((k) => delete state.lineOverrides[k])
    state.hideNoLineData = false
    state.stationHistory.splice(0, state.stationHistory.length)
    state.favorites.splice(0, state.favorites.length)
    persist()
  }

  function setTab(tab: TabId) {
    state.activeTab = tab
    persist()
  }

  return {
    state,
    filteredStations,
    totalStations,
    get actions() {
      return state.actions
    },
    get activeTab() {
      return state.activeTab
    },
    get crossedOff() {
      return state.crossedOff
    },
    get favorites() {
      return state.favorites
    },
    get hideNoLineData() {
      return state.hideNoLineData
    },
    get stationHistory() {
      return state.stationHistory
    },
    addAction,
    setStationLines,
    getStationLines,
    toggleFavorite,
    toggleHideNoLineData,
    toggleStation,
    crossOffAll,
    restoreAll,
    removeStationEvent,
    toggleAction,
    removeAction,
    resetAll,
    setTab,
  }
}

type Store = ReturnType<typeof createStore>
let instance: Store | null = null

export function useStore(): Store {
  if (!instance) {
    instance = createStore()
  }
  return instance
}
