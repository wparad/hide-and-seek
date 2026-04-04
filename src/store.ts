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

interface GameState {
  actions: GameAction[]
  activeTab: TabId
}

const STORAGE_KEY = 'hide-and-seek-zurich'

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as GameState
      return {
        actions: parsed.actions ?? [],
        activeTab: parsed.activeTab ?? 'stations',
      }
    }
  } catch {
    // corrupted storage — start fresh
  }
  return { actions: [], activeTab: 'stations' }
}

function saveState(state: GameState) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ actions: state.actions, activeTab: state.activeTab }),
  )
}

function applyActions(allStations: Station[], actions: GameAction[]): Station[] {
  let result = allStations
  for (const action of actions) {
    if (!action.enabled) continue
    if (action.type === 'line') {
      if (action.mode === 'exclude') {
        result = result.filter((s) => !s.lines.includes(action.value))
      } else {
        result = result.filter((s) => s.lines.includes(action.value))
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

  const filteredStations = computed(() => applyActions(stations, state.actions))
  const totalStations = stations.length

  function persist() {
    saveState(state)
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

  function resetAll() {
    state.actions.splice(0, state.actions.length)
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
    addAction,
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
