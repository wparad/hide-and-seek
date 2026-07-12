/**
 * Fetches station ordering for all S-Bahn lines from the transport.opendata.ch API.
 * Strategy: for each line, find a station on that line and query stationboard.
 * From the passList we get the correct station order.
 *
 * Output: prints a TypeScript `lineRoutes` export ready to paste into stations.ts
 *
 * Run: npx tsx scripts/fetch-line-routes.ts
 */

const LINES = [
  'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11',
  'S12', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21',
  'S24', 'S25', 'S26', 'S29', 'S30', 'S33', 'S35', 'S36', 'S40', 'S41', 'S42',
]

const SEED_STATIONS = [
  'Zürich HB',
  'Winterthur',
  'Bülach',
  'Rapperswil SG',
  'Uster',
  'Dietikon',
  'Wädenswil',
  'Thalwil',
  'Stettbach',
  'Effretikon',
  'Zürich Oerlikon',
  'Zürich Stadelhofen',
  'Affoltern am Albis',
  'Dielsdorf',
  'Horgen',
  'Wetzikon ZH',
  'Pfäffikon SZ',
  'Rüti ZH',
]

interface PassStop {
  station: { name: string | null }
  arrival: string | null
  departure: string | null
}

interface StationboardEntry {
  category: string
  number: string
  passList?: PassStop[]
  to: string
}

async function fetchStationboard(station: string): Promise<StationboardEntry[]> {
  const params = new URLSearchParams({
    station,
    limit: '80',
    'transportations[]': 'train',
    datetime: '2026-07-12 06:00',
  })
  const url = `https://transport.opendata.ch/v1/stationboard?${params}`
  const resp = await fetch(url)
  if (!resp.ok) {
    console.error(`  WARN: ${station} returned ${resp.status}`)
    return []
  }
  const data = await resp.json()
  return data.stationboard ?? []
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const lineRoutes: Record<string, string[]> = {}
  const missingLines = new Set(LINES)

  console.error('Fetching stationboard data from seed stations...')

  for (const seedStation of SEED_STATIONS) {
    if (missingLines.size === 0) break

    console.error(`  Querying ${seedStation}... (${missingLines.size} lines remaining)`)
    const board = await fetchStationboard(seedStation)

    for (const entry of board) {
      const line = `${entry.category}${entry.number}`
      if (!LINES.includes(line)) continue
      if (!entry.passList) continue

      const stops = entry.passList
        .filter((s) => s.station?.name)
        .map((s) => s.station.name as string)

      if (stops.length < 2) continue

      // Include the departure station at the front if not already there
      const fullRoute = stops[0] === seedStation ? stops : [seedStation, ...stops]

      // Keep the longest route we find for each line
      const existing = lineRoutes[line]
      if (!existing || fullRoute.length > existing.length) {
        lineRoutes[line] = fullRoute
      }

      if (fullRoute.length >= 3) {
        missingLines.delete(line)
      }
    }

    await sleep(500)
  }

  // Second pass: for still-missing lines, query stations known to be on those lines
  if (missingLines.size > 0) {
    console.error(`\n  Second pass for: ${[...missingLines].join(', ')}`)
    const { stations } = await import('../src/stations.ts')

    for (const line of [...missingLines]) {
      const stationsOnLine = stations.filter((s) => s.lines.includes(line))
      for (const station of stationsOnLine.slice(0, 3)) {
        console.error(`    Trying ${station.name} for ${line}...`)
        const board = await fetchStationboard(station.name)
        for (const entry of board) {
          const entryLine = `${entry.category}${entry.number}`
          if (entryLine !== line) continue
          if (!entry.passList) continue

          const stops = entry.passList
            .filter((s) => s.station?.name)
            .map((s) => s.station.name as string)

          if (stops.length < 2) continue
          const fullRoute = stops[0] === station.name ? stops : [station.name, ...stops]
          const existing = lineRoutes[line]
          if (!existing || fullRoute.length > existing.length) {
            lineRoutes[line] = fullRoute
          }
        }
        await sleep(500)
        if (lineRoutes[line]) {
          missingLines.delete(line)
          break
        }
      }
    }
  }

  // Report
  console.error(`\nResults:`)
  console.error(`  Lines found: ${Object.keys(lineRoutes).length}/${LINES.length}`)
  if (missingLines.size > 0) {
    console.error(`  Missing: ${[...missingLines].join(', ')}`)
  }

  // Check for unknown stations
  const { stations } = await import('../src/stations.ts')
  const knownNames = new Set(stations.map((s) => s.name))
  const unknownStations: string[] = []
  for (const [line, route] of Object.entries(lineRoutes)) {
    for (const name of route) {
      if (!knownNames.has(name)) unknownStations.push(`${name} (${line})`)
    }
  }
  if (unknownStations.length > 0) {
    console.error(`\n  ⚠️  Stations in routes NOT in stations.ts:`)
    for (const s of [...new Set(unknownStations)].sort()) {
      console.error(`    - ${s}`)
    }
  }

  // Output TypeScript
  console.log(`/** Station ordering per line (fetched from transport.opendata.ch) */`)
  console.log(`export const lineRoutes: Record<string, string[]> = {`)
  for (const line of LINES) {
    const route = lineRoutes[line]
    if (!route) continue
    const quoted = route.map((s) => `'${s.replace(/'/g, "\\'")}'`)
    console.log(`  '${line}': [${quoted.join(', ')}],`)
  }
  console.log(`}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
