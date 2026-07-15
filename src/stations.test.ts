import { describe, it, expect } from 'vitest'
import { stations, buildGeoLines } from './stations'

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

describe('buildGeoLines', () => {
  const geoLines = buildGeoLines()

  it('computes in under 50ms', () => {
    const start = performance.now()
    for (let i = 0; i < 100; i++) buildGeoLines()
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(50) // 100 runs in under 50ms
  })

  it('produces a line for every line name in stations', () => {
    const allLines = new Set<string>()
    for (const s of stations) {
      for (const l of s.lines) allLines.add(l)
    }
    for (const line of allLines) {
      expect(geoLines[line], `missing geo line for ${line}`).toBeDefined()
    }
  })

  it.each(Object.entries(geoLines))('%s is in nearest-neighbor order', (_line, coords) => {
    if (coords.length < 3) return
    for (let i = 0; i < coords.length - 1; i++) {
      const current = coords[i]
      const next = coords[i + 1]
      const distToNext = haversine(current, next)
      for (let j = i + 2; j < coords.length; j++) {
        const distToJ = haversine(current, coords[j])
        if (distToJ < distToNext * 0.8) {
          expect.fail(
            `[${i}] → [${i + 1}] (${Math.round(distToNext)}m) but [${j}] is closer (${Math.round(distToJ)}m)`,
          )
        }
      }
    }
  })
})
