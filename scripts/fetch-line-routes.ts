/**
 * Queries transport.opendata.ch stationboard API for each station to determine
 * which S-Bahn lines serve it. Results are cached incrementally to
 * data/stationboard-results.json so the script can be resumed after interruption.
 *
 * Output (stderr): comparison report — stationboard-derived lines vs hardcoded lines in stations.ts
 * Output (stdout): updated station `lines` arrays as TypeScript (matching stations.ts format)
 *
 * Run: npx tsx scripts/fetch-line-routes.ts
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { stations } from '../src/stations.ts'

const LINES = [
  'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11',
  'S12', 'S13', 'S14', 'S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21',
  'S24', 'S25', 'S26', 'S29', 'S30', 'S33', 'S35', 'S36', 'S40', 'S41', 'S42',
] as const

const LINES_SET = new Set<string>(LINES)

const DATA_DIR = join(import.meta.dirname!, '../data')
const RESULTS_FILE = join(DATA_DIR, 'stationboard-results.json')

const BASE_URL = 'https://transport.opendata.ch/v1/stationboard'
const LIMIT = 300

function getNextSaturday(): string {
  const now = new Date()
  const day = now.getDay()
  const daysUntilSat = day === 6 ? 0 : (6 - day + 7) % 7
  const sat = new Date(now)
  sat.setDate(now.getDate() + daysUntilSat)
  return `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')} 10:00`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function loadResults(): Record<string, string[]> {
  if (!existsSync(RESULTS_FILE)) return {}
  return JSON.parse(readFileSync(RESULTS_FILE, 'utf-8'))
}

function saveResults(results: Record<string, string[]>): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2) + '\n')
}

interface IStationboardEntry {
  category: string
  number: string
  stop: { departure: string | null }
}

async function fetchStationboard(station: string, datetime: string): Promise<IStationboardEntry[]> {
  const url = new URL(BASE_URL)
  url.searchParams.set('station', station)
  url.searchParams.set('limit', String(LIMIT))
  url.searchParams.append('transportations[]', 'train')
  url.searchParams.set('datetime', datetime)

  const resp = await fetch(url.toString())
  if (!resp.ok) {
    console.error(`  ⚠️  HTTP ${resp.status} for ${station}`)
    return []
  }
  const data = await resp.json()
  return data.stationboard ?? []
}

function extractLines(entries: IStationboardEntry[]): Set<string> {
  const lines = new Set<string>()
  for (const entry of entries) {
    if (entry.category === 'S') {
      const line = 'S' + entry.number
      if (LINES_SET.has(line)) lines.add(line)
    }
  }
  return lines
}

function parseTime(isoString: string | null): string | null {
  if (!isoString) return null
  // Format: "2026-07-19T18:32:00+0200" — extract HH:MM
  const match = isoString.match(/T(\d{2}:\d{2})/)
  return match ? match[1] : null
}

async function queryStation(stationName: string): Promise<string[]> {
  // Page 1
  const page1 = await fetchStationboard(stationName, getNextSaturday())
  const lines = extractLines(page1)

  // Page 2: if we got 300 results and the last departure is before 20:00
  if (page1.length >= LIMIT) {
    const lastEntry = page1[page1.length - 1]
    const lastTime = parseTime(lastEntry?.stop?.departure)
    if (lastTime && lastTime < '20:00') {
      const lastDep = lastEntry.stop.departure!
      // Use the full ISO datetime for the next query — extract date + time
      const dateTimePart = lastDep.replace(/T/, ' ').replace(/\+.*$/, '').slice(0, 16)
      console.error(`    Page 2 from ${dateTimePart}`)
      await sleep(500)
      const page2 = await fetchStationboard(stationName, dateTimePart)
      for (const line of extractLines(page2)) lines.add(line)
    }
  }

  // Sort by LINES order
  return LINES.filter((l) => lines.has(l))
}

async function main() {
  const results = loadResults()
  const total = stations.length
  let processed = 0

  for (const station of stations) {
    processed++
    if (results[station.name]) {
      console.error(`  [${processed}/${total}] ${station.name} — cached`)
      continue
    }

    const queryName = station.apiName ?? station.name
    console.error(`  [${processed}/${total}] ${station.name}...`)
    const lines = await queryStation(queryName)
    results[station.name] = lines
    saveResults(results)
    console.error(`    → ${lines.join(', ') || '(none)'}`)
    await sleep(500)
  }

  // === Comparison report (stderr) ===
  console.error('\n  === Lines-per-station comparison (stationboard vs hardcoded) ===')
  let diffs = 0
  for (const s of stations) {
    const hardcoded = new Set(s.lines)
    const fromApi = new Set(results[s.name] ?? [])
    const toAdd = [...fromApi].filter((l) => !hardcoded.has(l)).sort()
    const toRemove = [...hardcoded].filter((l) => !fromApi.has(l)).sort()
    if (toAdd.length || toRemove.length) {
      const parts: string[] = []
      if (toAdd.length) parts.push(`+${toAdd.join(',')}`)
      if (toRemove.length) parts.push(`-${toRemove.join(',')}`)
      console.error(`    ${s.name}: current=[${s.lines.join(',')}] api=[${(results[s.name] ?? []).join(',')}] ${parts.join(' ')}`)
      diffs++
    }
  }
  if (diffs === 0) console.error('    ✓ No discrepancies')
  else console.error(`\n    ${diffs} stations with discrepancies`)

  // === Output updated stations TypeScript (stdout) ===
  console.log(`export const stations: Station[] = [`)
  for (const s of stations) {
    const lines = results[s.name] ?? s.lines
    const linesStr = lines.map((l: string) => `'${l}'`).join(', ')
    const coordStr = `[${s.coordinates[0]}, ${s.coordinates[1]}]`
    const entry = `  { name: '${s.name.replace(/'/g, "\\'")}', coordinates: ${coordStr}, lines: [${linesStr}] },`
    console.log(entry)
  }
  console.log(`]`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
