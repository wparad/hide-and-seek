import { stations, lineRoutes } from '../src/stations.ts'

const derived = new Map<string, Set<string>>()
for (const [line, route] of Object.entries(lineRoutes)) {
  for (const name of route) {
    const s = derived.get(name)
    if (s) s.add(line)
    else derived.set(name, new Set([line]))
  }
}

for (const s of stations) {
  const hardcoded = new Set(s.lines)
  const fromRoutes = derived.get(s.name) ?? new Set<string>()
  const miss = [...fromRoutes].filter((l) => !hardcoded.has(l)).sort()
  const extra = [...hardcoded].filter((l) => !fromRoutes.has(l)).sort()
  if (miss.length || extra.length) {
    const parts: string[] = []
    if (miss.length) parts.push('needs +' + miss.join(','))
    if (extra.length) parts.push('has extra ' + extra.join(','))
    console.log(`${s.name}: ${parts.join(' | ')}`)
  }
}

const knownNames = new Set(stations.map((s) => s.name))
for (const [line, route] of Object.entries(lineRoutes)) {
  for (const name of route) {
    if (!knownNames.has(name)) console.log(`MISSING STATION: ${name} (${line})`)
  }
}
