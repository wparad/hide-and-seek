/**
 * Fetches complete station ordering for all ZVV S-Bahn lines from the Swiss GTFS feed.
 * Source: gtfs.geops.ch (no auth required, daily-updated mirror of opentransportdata.swiss)
 *
 * Strategy:
 * 1. Download the GTFS zip
 * 2. Parse routes.txt → find ZVV S-Bahn route IDs
 * 3. Parse trips.txt → find trips for those routes
 * 4. Parse stop_times.txt → get ordered stops per trip
 * 5. Parse stops.txt → map stop_id to stop_name
 * 6. For each line: pick the trip with the most stops, filter to known stations
 *
 * Output: prints a TypeScript `lineRoutes` export ready to paste into stations.ts
 *
 * Run: npx tsx scripts/fetch-line-routes.ts
 */

import { createWriteStream, mkdirSync, existsSync, createReadStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const GTFS_URL = 'https://gtfs.geops.ch/dl/gtfs_complete.zip'
const TMP_DIR = join(import.meta.dirname, '../.gtfs-tmp')
const ZIP_PATH = join(TMP_DIR, 'gtfs.zip')

const LINES = [
  'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11',
  'S12', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21',
  'S24', 'S25', 'S26', 'S29', 'S30', 'S33', 'S35', 'S36', 'S40', 'S41', 'S42',
]

async function downloadGtfs() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })
  if (existsSync(ZIP_PATH)) {
    console.error('  Using cached GTFS zip')
    return
  }
  console.error('  Downloading GTFS feed...')
  const resp = await fetch(GTFS_URL)
  if (!resp.ok || !resp.body) throw new Error(`Download failed: ${resp.status}`)
  await pipeline(resp.body as unknown as NodeJS.ReadableStream, createWriteStream(ZIP_PATH))
  console.error('  Download complete')
}

function extractGtfs() {
  console.error('  Extracting...')
  execSync(
    `unzip -o -q "${ZIP_PATH}" routes.txt trips.txt stop_times.txt stops.txt -d "${TMP_DIR}"`,
  )
}

function parseCsvLine(line: string, headers: string[]): Record<string, string> {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }
    current += ch
  }
  values.push(current)
  const row: Record<string, string> = {}
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]] = values[i] ?? ''
  }
  return row
}

async function parseCsv(
  filename: string,
  filter?: (row: Record<string, string>) => boolean,
): Promise<Record<string, string>[]> {
  const filePath = join(TMP_DIR, filename)
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
  let headers: string[] | null = null
  const rows: Record<string, string>[] = []
  for await (const line of rl) {
    if (!headers) {
      headers = line
        .replace(/^\uFEFF/, '')
        .split(',')
        .map((h) => h.replace(/"/g, '').trim())
      continue
    }
    const row = parseCsvLine(line, headers)
    if (!filter || filter(row)) rows.push(row)
  }
  return rows
}

async function main() {
  await downloadGtfs()
  extractGtfs()

  // 1. Parse stops.txt → map stop_id to stop_name
  console.error('  Parsing stops.txt...')
  const stopsRows = await parseCsv('stops.txt')
  const stopIdToName = new Map<string, string>()
  for (const row of stopsRows) {
    stopIdToName.set(row.stop_id, row.stop_name)
  }

  // 2. Parse routes.txt → find S-Bahn route IDs
  console.error('  Parsing routes.txt...')
  const routesRows = await parseCsv('routes.txt', (row) => {
    const shortName = row.route_short_name?.trim()
    return LINES.includes(shortName)
  })
  const routeIdToLine = new Map<string, string>()
  for (const row of routesRows) {
    routeIdToLine.set(row.route_id, row.route_short_name.trim())
  }
  console.error(`  Found ${routeIdToLine.size} S-Bahn routes`)

  // 3. Parse trips.txt → map trip_id to line
  console.error('  Parsing trips.txt...')
  const tripsRows = await parseCsv('trips.txt', (row) => routeIdToLine.has(row.route_id))
  const tripIdToLine = new Map<string, string>()
  for (const row of tripsRows) {
    tripIdToLine.set(row.trip_id, routeIdToLine.get(row.route_id)!)
  }
  console.error(`  Found ${tripIdToLine.size} S-Bahn trips`)

  // 4. Parse stop_times.txt → group stops by trip
  console.error('  Parsing stop_times.txt (this takes a moment)...')
  const tripStops = new Map<string, { seq: number; stopId: string }[]>()
  const stopTimesPath = join(TMP_DIR, 'stop_times.txt')
  const rl = createInterface({ input: createReadStream(stopTimesPath), crlfDelay: Infinity })
  let stHeaders: string[] | null = null
  for await (const line of rl) {
    if (!stHeaders) {
      stHeaders = line
        .replace(/^\uFEFF/, '')
        .split(',')
        .map((h) => h.replace(/"/g, '').trim())
      continue
    }
    const row = parseCsvLine(line, stHeaders)
    if (!tripIdToLine.has(row.trip_id)) continue
    const arr = tripStops.get(row.trip_id)
    const entry = { seq: parseInt(row.stop_sequence, 10), stopId: row.stop_id }
    if (arr) arr.push(entry)
    else tripStops.set(row.trip_id, [entry])
  }
  console.error(`  Collected stop times for ${tripStops.size} trips`)

  // 5. For each line, find the trip with the most stops
  const { stations } = await import('../src/stations.ts')
  const knownNames = new Set(stations.map((s) => s.name))

  // Group trips by line
  const lineTrips = new Map<string, string[]>()
  for (const [tripId, line] of tripIdToLine) {
    const arr = lineTrips.get(line)
    if (arr) arr.push(tripId)
    else lineTrips.set(line, [tripId])
  }

  const lineRoutes: Record<string, string[]> = {}
  const unknownStations: string[] = []

  for (const line of LINES) {
    const trips = lineTrips.get(line) ?? []
    let bestRoute: string[] = []

    for (const tripId of trips) {
      const stops = tripStops.get(tripId)
      if (!stops) continue
      stops.sort((a, b) => a.seq - b.seq)
      const names = stops.map((s) => stopIdToName.get(s.stopId) ?? '').filter(Boolean)

      // Filter to known stations only
      const filtered = names.filter((n) => knownNames.has(n))
      // Deduplicate consecutive (some GTFS feeds repeat stops)
      const deduped = filtered.filter((n, i) => i === 0 || n !== filtered[i - 1])

      if (deduped.length > bestRoute.length) {
        bestRoute = deduped
        // Track unknown stations for reporting
        for (const n of names) {
          if (!knownNames.has(n)) unknownStations.push(`${n} (${line})`)
        }
      }
    }

    if (bestRoute.length >= 2) {
      lineRoutes[line] = bestRoute
    }
  }

  // Report
  console.error(`\nResults:`)
  console.error(`  Lines found: ${Object.keys(lineRoutes).length}/${LINES.length}`)
  const missing = LINES.filter((l) => !lineRoutes[l])
  if (missing.length > 0) console.error(`  Missing: ${missing.join(', ')}`)

  if (unknownStations.length > 0) {
    const unique = [...new Set(unknownStations)].sort()
    console.error(`\n  ⚠️  Stations in routes NOT in stations.ts (${unique.length}):`)
    for (const s of unique.slice(0, 30)) console.error(`    - ${s}`)
    if (unique.length > 30) console.error(`    ... and ${unique.length - 30} more`)
  }

  // Output TypeScript
  console.log(`/**`)
  console.log(` * Station ordering per line (fetched from GTFS via gtfs.geops.ch).`)
  console.log(` * Routes only include stations in the \`stations\` array above.`)
  console.log(` */`)
  console.log(`export const lineRoutes: Record<string, string[]> = {`)
  for (const line of LINES) {
    const route = lineRoutes[line]
    if (!route) continue
    const quoted = route.map((s) => `'${s.replace(/'/g, "\\'")}'`)
    if (quoted.length <= 6) {
      console.log(`  ${line}: [${quoted.join(', ')}],`)
    } else {
      console.log(`  ${line}: [`)
      for (const q of quoted) console.log(`    ${q},`)
      console.log(`  ],`)
    }
  }
  console.log(`}`)

  // Cleanup
  await rm(TMP_DIR, { recursive: true, force: true })
  console.error('\n  Done. Paste the output into src/stations.ts replacing the existing lineRoutes.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
