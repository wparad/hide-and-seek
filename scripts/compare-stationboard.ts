import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stations } from '../src/stations.ts'

const results = JSON.parse(readFileSync(join(import.meta.dirname, '../data/stationboard-results.json'), 'utf-8'))
const constructionSkip = new Set(['Urdorf', 'Urdorf Weihermatt', 'Birmensdorf ZH', 'Bonstetten-Wettswil', 'Kempten'])

for (const s of stations) {
  if (constructionSkip.has(s.name)) continue
  const api: string[] = results[s.name] || []
  if (api.length === 0) continue // no data (S17/S18/construction)
  const hardcoded = new Set(s.lines.filter(l => l !== 'S17' && l !== 'S18'))
  const fromApi = new Set(api)
  const toAdd = [...fromApi].filter(l => !hardcoded.has(l)).sort()
  const toRemove = [...hardcoded].filter(l => !fromApi.has(l)).sort()
  if (toAdd.length || toRemove.length) {
    const parts: string[] = []
    if (toAdd.length) parts.push('+' + toAdd.join(','))
    if (toRemove.length) parts.push('-' + toRemove.join(','))
    console.log(`${s.name} | current: [${s.lines.join(',')}] | api: [${api.join(',')}] | ${parts.join(' ')}`)
  }
}
