import { describe, it, expect } from 'vitest'
import { stations, geoLineDrawing } from './stations'

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)
  const h = sinLat * sinLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLng * sinLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

describe('geoLineDrawing', () => {
  const stationCoords = new Map(stations.map((s) => [s.name, s.coordinates]))

  it.each(Object.entries(geoLineDrawing))('%s is in nearest-neighbor order', (line, route) => {
    const coords = route
      .map((name) => stationCoords.get(name))
      .filter((c): c is [number, number] => c !== undefined)

    if (coords.length < 3) return

    for (let i = 0; i < coords.length - 1; i++) {
      const current = coords[i]
      const next = coords[i + 1]
      const distToNext = haversine(current, next)

      // Check that no later station is closer than the next one (with 20% slack)
      for (let j = i + 2; j < coords.length; j++) {
        const distToJ = haversine(current, coords[j])
        if (distToJ < distToNext * 0.8) {
          expect.fail(
            `${line}[${i}] "${route[i]}" → "${route[i + 1]}" (${Math.round(distToNext)}m) ` +
              `but "${route[j]}" is closer (${Math.round(distToJ)}m)`,
          )
        }
      }
    }
  })
})
