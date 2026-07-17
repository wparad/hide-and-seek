import { ref } from 'vue'

/** Global reactive GPS position, updated by a single watchPosition call. */
export const userPosition = ref<[number, number] | null>(null)

let started = false

export function startGps() {
  if (started || !navigator.geolocation) return
  started = true
  navigator.geolocation.watchPosition(
    (pos) => {
      userPosition.value = [pos.coords.longitude, pos.coords.latitude]
    },
    () => {
      // permission denied or unavailable — leave as null
    },
    { enableHighAccuracy: true },
  )
}
