import { reactive, computed } from 'vue'
import { stations } from './stations'

export type TabId = 'map' | 'stations' | 'reachability' | 'endgame' | 'rules' | 'settings'

export type ToolType = 'manual' | 'bisect' | 'radius' | 'endgame' | 'distance'

export interface MapLayerVisibility {
  roads: boolean
  rail: boolean
  labels: boolean
  buildings: boolean
  poi: boolean
  water: boolean
  landuse: boolean
}

export interface ToolHistoryZone {
  center: [number, number]
  radiusM: number
  inside: boolean
}

export interface BisectHistoryParams {
  start: [number, number]
  angle: number
  distance: number
}

export interface RadiusHistoryParams {
  center: [number, number]
  meters: number
}

export interface EndgameHistoryParams {
  station: string
  radiusKm: number
  zones: ToolHistoryZone[]
}

export interface DistanceHistoryParams {
  pointA: [number, number]
  pointB: [number, number]
}

export type ToolParams =
  | BisectHistoryParams
  | RadiusHistoryParams
  | EndgameHistoryParams
  | DistanceHistoryParams

// A single unified history entry. Every tool — including a plain manual mark-off — stores the
// exact station list it produces rather than mutating a shared crossed-off set directly; the
// crossed-off set is a pure computed union of every *enabled* entry's stations. Disabling an
// entry (rather than deleting it) is the normal way to "undo" a tool's application.
export interface ToolEntry {
  id: string
  type: ToolType
  enabled: boolean
  createdAt: number
  description: string
  stations: string[]
  reason?: string
  params?: ToolParams
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

const STATE_VERSION = 3

const DEFAULT_MAP_LAYERS: MapLayerVisibility = {
  roads: false,
  rail: true,
  labels: false,
  buildings: true,
  poi: false,
  water: true,
  landuse: true,
}

interface GameState {
  tools: ToolEntry[]
  activeTab: TabId
  favorites: string[]
  lineOverrides: Record<string, string[]>
  hideNoLineData: boolean
  mapLayers: MapLayerVisibility
  showStationLabels: boolean
  flexibleHidingZone: boolean
  questionCounts: Record<string, number>
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

function freshState(fromUrl: string[] | null): GameState {
  const tools: ToolEntry[] = fromUrl
    ? [
        {
          id: crypto.randomUUID(),
          type: 'manual',
          enabled: true,
          createdAt: Date.now(),
          description: 'Imported from URL',
          stations: fromUrl,
          reason: 'Imported from URL',
        },
      ]
    : []
  return {
    tools,
    activeTab: 'stations',
    favorites: [],
    lineOverrides: {},
    hideNoLineData: true,
    mapLayers: { ...DEFAULT_MAP_LAYERS },
    showStationLabels: true,
    flexibleHidingZone: false,
    questionCounts: {},
  }
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
      // Drop legacy border-visibility toggles — borders are now always drawn.
      const rawMapLayers = { ...(parsed.mapLayers ?? {}) }
      delete rawMapLayers.boundaries
      delete rawMapLayers.bordersInternational
      delete rawMapLayers.bordersCantonal
      const tools: ToolEntry[] = fromUrl
        ? [
            {
              id: crypto.randomUUID(),
              type: 'manual',
              enabled: true,
              createdAt: Date.now(),
              description: 'Imported from URL',
              stations: fromUrl,
              reason: 'Imported from URL',
            },
          ]
        : (parsed.tools ?? [])
      return {
        tools,
        activeTab: parsed.activeTab ?? 'stations',
        favorites: parsed.favorites ?? [],
        lineOverrides: parsed.lineOverrides ?? {},
        hideNoLineData: parsed.hideNoLineData ?? true,
        mapLayers: { ...DEFAULT_MAP_LAYERS, ...rawMapLayers },
        showStationLabels: parsed.showStationLabels ?? true,
        flexibleHidingZone: parsed.flexibleHidingZone ?? false,
        questionCounts: parsed.questionCounts ?? {},
      }
    }
  } catch {
    // corrupted storage — start fresh
  }
  return freshState(fromUrl)
}

function saveState(state: GameState) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: STATE_VERSION,
      tools: state.tools,
      activeTab: state.activeTab,
      favorites: state.favorites,
      lineOverrides: state.lineOverrides,
      hideNoLineData: state.hideNoLineData,
      mapLayers: state.mapLayers,
      showStationLabels: state.showStationLabels,
      flexibleHidingZone: state.flexibleHidingZone,
      questionCounts: state.questionCounts,
    }),
  )
}

// The only place the crossed-off set is computed: a union of every enabled tool's station list.
// Later entries win on the displayed reason for a station crossed off by more than one tool.
function computeCrossedOff(tools: ToolEntry[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const tool of tools) {
    if (!tool.enabled) continue
    for (const name of tool.stations) {
      result[name] = tool.reason ?? tool.description
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

  const crossedOff = computed(() => computeCrossedOff(state.tools))
  // No filter tools exist yet (line/character filters were dead code and were removed) — kept as
  // a plain alias so existing "N / total stations" displays keep working.
  const filteredStations = computed(() => stations)
  const totalStations = stations.length

  function persist() {
    saveState(state)
    syncUrl(crossedOff.value)
  }

  function addTool(
    type: ToolType,
    description: string,
    toolStations: string[],
    opts?: { reason?: string; params?: ToolParams; enabled?: boolean },
  ): string {
    const id = crypto.randomUUID()
    state.tools.unshift({
      id,
      type,
      enabled: opts?.enabled ?? true,
      createdAt: Date.now(),
      description,
      stations: toolStations,
      reason: opts?.reason,
      params: opts?.params,
    })
    persist()
    return id
  }

  function toggleTool(id: string) {
    const tool = state.tools.find((t) => t.id === id)
    if (tool) {
      tool.enabled = !tool.enabled
      persist()
    }
  }

  function isToolEnabled(id: string): boolean {
    return state.tools.find((t) => t.id === id)?.enabled ?? false
  }

  function removeTool(id: string) {
    const idx = state.tools.findIndex((t) => t.id === id)
    if (idx !== -1) {
      state.tools.splice(idx, 1)
      persist()
    }
  }

  // Single-station manual toggle. Crossing off adds a new manual tool entry; restoring disables
  // every currently-enabled tool (of any type) that includes this station.
  function toggleStation(name: string, reason?: string) {
    if (name in crossedOff.value) {
      for (const tool of state.tools) {
        if (tool.enabled && tool.stations.includes(name)) tool.enabled = false
      }
      persist()
    } else {
      const r = reason ?? 'No reason given'
      addTool('manual', r, [name], { reason: r })
    }
  }

  // Bulk manual mark-off (settings "check all", reachability auto-exclude, etc.) — one tool
  // entry for the whole batch, so it's a single togglable/undoable unit.
  function crossOffAll(names: string[], reason: string): string {
    const fresh = names.filter((n) => !(n in crossedOff.value))
    if (fresh.length === 0) return ''
    return addTool('manual', reason, fresh, { reason })
  }

  // Disables every enabled tool — "Unmark all".
  function restoreAll() {
    for (const tool of state.tools) tool.enabled = false
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
    return crossedOff.value[name]
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

  function toggleFlexibleHidingZone() {
    state.flexibleHidingZone = !state.flexibleHidingZone
    persist()
  }

  function resetAll() {
    state.tools.splice(0, state.tools.length)
    Object.keys(state.lineOverrides).forEach((k) => delete state.lineOverrides[k])
    state.hideNoLineData = true
    state.favorites.splice(0, state.favorites.length)
    Object.assign(state.mapLayers, DEFAULT_MAP_LAYERS)
    state.showStationLabels = true
    state.flexibleHidingZone = false
    state.questionCounts = {}
    // Clear all app localStorage keys
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('hide-and-seek')) keysToRemove.push(key)
    }
    for (const key of keysToRemove) localStorage.removeItem(key)
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

  function activateQuestion(id: string) {
    state.questionCounts[id] = (state.questionCounts[id] ?? 0) + 1
    persist()
  }

  return {
    state,
    filteredStations,
    totalStations,
    reachability,
    get activeTab() {
      return state.activeTab
    },
    get crossedOff() {
      return crossedOff.value
    },
    get favorites() {
      return state.favorites
    },
    get hideNoLineData() {
      return state.hideNoLineData
    },
    get tools() {
      return state.tools
    },
    get mapLayers() {
      return state.mapLayers
    },
    get showStationLabels() {
      return state.showStationLabels
    },
    get flexibleHidingZone() {
      return state.flexibleHidingZone
    },
    get questionCounts() {
      return state.questionCounts
    },
    setStationLines,
    getStationLines,
    getCrossOffReason,
    toggleFavorite,
    toggleHideNoLineData,
    toggleShowStationLabels,
    toggleFlexibleHidingZone,
    toggleStation,
    crossOffAll,
    restoreAll,
    addTool,
    toggleTool,
    isToolEnabled,
    removeTool,
    resetAll,
    setTab,
    toggleMapLayer,
    activateQuestion,
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
