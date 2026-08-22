import { reactive } from 'vue'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error'
}

export const toasts = reactive<Toast[]>([])

export function showToast(
  message: string,
  type: 'success' | 'error' = 'success',
  durationMs = 3000,
) {
  const id = crypto.randomUUID()
  toasts.push({ id, message, type })
  setTimeout(() => {
    const idx = toasts.findIndex((t) => t.id === id)
    if (idx !== -1) toasts.splice(idx, 1)
  }, durationMs)
}

export function dismissToast(id: string) {
  const idx = toasts.findIndex((t) => t.id === id)
  if (idx !== -1) toasts.splice(idx, 1)
}
