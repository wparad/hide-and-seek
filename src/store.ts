import { reactive, computed } from 'vue'
import { stations, type Station } from './stations'

export type TabId = 'map' | 'stations' | 'history' | 'actions' | 'links' | 'reachability'

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

export interface MapLayerVisibility {
  roads: boolean
  rail: boolean
  labels: boolean
  buildings: boolean
  poi: boolean
  boundaries: boolean
  water: boolean
  landuse: boolean
}

export interface ReachableInfo {
  arrivalTime: string
  path: string[]
  needsOffset: boolean
}

export interface ReachabilityState {
  startStation: string
  startTime: string
  travelMinutes: number
  offsetMinutes: number
  results: Map<string, ReachableInfo> | null
  log: string[]
}

const STATE_VERSION = 2

const DEFAULT_MAP_LAYERS: MapLayerVisibility = {
  roads: false,
  rail: true,
  labels: false,
  buildings: true,
  poi: false,
  boundaries: false,
  water: true,
  landuse: true,
}

interface GameState {
  actions: GameAction[]
  activeTab: TabId
  crossedOff: Record<string, string>
  favorites: string[]
  lineOverrides: Record<string, string[]>
  hideNoLineData: boolean
  stationHistory: StationEvent[]
  mapLayers: MapLayerVisibility
  showStationLabels: boolean
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

function syncUrl(crossedOff: Record<string, string>) {
  const names = Object.keys(crossedOff)
  const url = new URL(window.location.href)
  if (names.length === 0) {
    url.searchParams.delete('c')
  } else {
    url.searchParams.set('c', namesToIds(names).join(','))
  }
  history.replaceState(null, '', url)
}

function loadState(): GameState {
  const fromUrl = crossedOffFromUrl()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.version !== STATE_VERSION) {
        localStorage.removeItem(STORAGE_KEY)
        return freshState(fromUrl)
      }
      const crossedOff = fromUrl
        ? Object.fromEntries(fromUrl.map((n) => [n, 'Imported from URL']))
        : (parsed.crossedOff ?? {})
      return {
        actions: parsed.actions ?? [],
        activeTab: parsed.activeTab ?? 'stations',
        crossedOff,
        favorites: parsed.favorites ?? [],
        lineOverrides: parsed.lineOverrides ?? {},
        hideNoLineData: parsed.hideNoLineData ?? true,
        stationHistory: parsed.stationHistory ?? [],
        mapLayers: { ...DEFAULT_MAP_LAYERS, ...(parsed.mapLayers ?? {}) },
        showStationLabels: parsed.showStationLabels ?? true,
      }
    }
  } catch {
    // corrupted storage — start fresh
  }
  return freshState(fromUrl)
}

function freshState(fromUrl: string[] | null): GameState {
  const crossedOff = fromUrl ? Object.fromEntries(fromUrl.map((n) => [n, 'Imported from URL'])) : {}
  return {
    actions: [],
    activeTab: 'stations',
    crossedOff,
    favorites: [],
    lineOverrides: {},
    hideNoLineData: true,
    stationHistory: [],
    mapLayers: { ...DEFAULT_MAP_LAYERS },
    showStationLabels: true,
  }
}

function saveState(state: GameState) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: STATE_VERSION,
      actions: state.actions,
      activeTab: state.activeTab,
      crossedOff: state.crossedOff,
      favorites: state.favorites,
      lineOverrides: state.lineOverrides,
      hideNoLineData: state.hideNoLineData,
      stationHistory: state.stationHistory,
      mapLayers: state.mapLayers,
      showStationLabels: state.showStationLabels,
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

function getCurrentTime(): string {
  const now = new Date()
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
}

function createStore() {
  const initial = loadState()
  const state = reactive<GameState>(initial)

  const reachability = reactive<ReachabilityState>({
    startStation: '',
    startTime: getCurrentTime(),
    travelMinutes: 45,
    offsetMinutes: 3,
    results: null,
    log: [],
  })

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

  function toggleStation(name: string, reason?: string) {
    const isCrossedOff = name in state.crossedOff
    if (isCrossedOff) {
      delete state.crossedOff[name]
      state.stationHistory.push({
        id: crypto.randomUUID(),
        name,
        type: 'restore',
        createdAt: Date.now(),
      })
    } else {
      state.crossedOff[name] = reason ?? 'No reason given'
      state.stationHistory.push({
        id: crypto.randomUUID(),
        name,
        type: 'cross-off',
        createdAt: Date.now(),
      })
    }
    persist()
  }

  function crossOffAll(names: string[], reason: string) {
    const now = Date.now()
    for (const name of names) {
      if (name in state.crossedOff) continue
      state.crossedOff[name] = reason
      state.stationHistory.push({
        id: crypto.randomUUID(),
        name,
        type: 'cross-off',
        createdAt: now,
      })
    }
    persist()
  }

  function restoreAll() {
    const now = Date.now()
    for (const name of Object.keys(state.crossedOff)) {
      state.stationHistory.push({ id: crypto.randomUUID(), name, type: 'restore', createdAt: now })
    }
    state.crossedOff = {}
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

  function getCrossOffReason(name: string): string | undefined {
    return state.crossedOff[name]
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

  function toggleShowStationLabels() {
    state.showStationLabels = !state.showStationLabels
    persist()
  }

  function resetAll() {
    state.actions.splice(0, state.actions.length)
    state.crossedOff = {}
    Object.keys(state.lineOverrides).forEach((k) => delete state.lineOverrides[k])
    state.hideNoLineData = true
    state.stationHistory.splice(0, state.stationHistory.length)
    state.favorites.splice(0, state.favorites.length)
    Object.assign(state.mapLayers, DEFAULT_MAP_LAYERS)
    state.showStationLabels = true
    persist()
  }

  function setTab(tab: TabId) {
    state.activeTab = tab
    persist()
  }

  function toggleMapLayer(layer: keyof MapLayerVisibility) {
    state.mapLayers[layer] = !state.mapLayers[layer]
    persist()
  }

  return {
    state,
    filteredStations,
    totalStations,
    reachability,
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
    get mapLayers() {
      return state.mapLayers
    },
    get showStationLabels() {
      return state.showStationLabels
    },
    addAction,
    setStationLines,
    getStationLines,
    getCrossOffReason,
    toggleFavorite,
    toggleHideNoLineData,
    toggleShowStationLabels,
    toggleStation,
    crossOffAll,
    restoreAll,
    removeStationEvent,
    toggleAction,
    removeAction,
    resetAll,
    setTab,
    toggleMapLayer,
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
