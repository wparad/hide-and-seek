/**
 * Fetches Switzerland's official canton geometry from the `swiss-maps` npm package (published
 * TopoJSON derived from swisstopo data), simplifies it, and writes two static, bundled data
 * files consumed by MapView.vue:
 *
 *  - src/canton-borders.ts   — one LineString/MultiLineString per canton (its full boundary),
 *                               for the always-on, line-following canton name labels, plus one
 *                               Point per canton (a point guaranteed to fall inside its polygon,
 *                               not just its centroid, which can land outside for concave cantons
 *                               like Wallis or Graubünden) for the horizontal "main" canton label
 *                               shown at low zoom.
 *  - src/switzerland-mask.ts — a single "world rectangle minus Switzerland" polygon, for the
 *                               grey hatch overlay over non-Swiss territory.
 *
 * The `cantons` layer's features carry no name property, only geometry — swiss-maps orders them
 * by the official BFS/swisstopo canton number (1 Zürich … 26 Jura), which CANTON_NAMES mirrors.
 *
 * Run: npx tsx scripts/fetch-canton-borders.ts && npm run format
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { feature } from 'topojson-client'
import { presimplify, simplify, quantile } from 'topojson-simplify'
import { polygonToLine } from '@turf/polygon-to-line'
import { pointOnFeature } from '@turf/point-on-feature'
import { mask } from '@turf/mask'
import type { Topology, GeometryCollection } from 'topojson-specification'

const SWISS_MAPS_URL = 'https://unpkg.com/swiss-maps@4.7.0/2026/ch-combined.json'

// swiss-maps orders cantons by the official BFS/swisstopo Kantonsnummer (1-26); the topology
// carries no name property so this positional list is the only link between geometry and name.
const CANTON_NAMES = [
  'Zürich',
  'Bern',
  'Luzern',
  'Uri',
  'Schwyz',
  'Obwalden',
  'Nidwalden',
  'Glarus',
  'Zug',
  'Freiburg',
  'Solothurn',
  'Basel-Stadt',
  'Basel-Landschaft',
  'Schaffhausen',
  'Appenzell Ausserrhoden',
  'Appenzell Innerrhoden',
  'St. Gallen',
  'Graubünden',
  'Aargau',
  'Thurgau',
  'Tessin',
  'Waadt',
  'Wallis',
  'Neuenburg',
  'Genf',
  'Jura',
]

async function main() {
  const res = await fetch(SWISS_MAPS_URL)
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`)
  const topo = (await res.json()) as Topology

  // Drop every layer but the two we need before simplifying, so shared-arc topology (and thus
  // point-removal weights) reflects only country + canton boundaries, not the much denser
  // districts/municipalities/lakes layers this file also ships.
  const trimmed: Topology = {
    ...topo,
    objects: { country: topo.objects.country, cantons: topo.objects.cantons },
  }
  const pre = presimplify(trimmed)
  const simplified = simplify(pre, quantile(pre, 0.02))

  const cantonsGeo = feature(
    simplified,
    simplified.objects.cantons as GeometryCollection,
  ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>
  const countryGeo = feature(
    simplified,
    simplified.objects.country as GeometryCollection,
  ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>

  if (cantonsGeo.features.length !== CANTON_NAMES.length) {
    throw new Error(
      `expected ${CANTON_NAMES.length} cantons, got ${cantonsGeo.features.length} — swiss-maps layout changed`,
    )
  }

  const cantonBorders: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: cantonsGeo.features.map((f, i) => {
      const line = polygonToLine(f)
      const geometry =
        line.type === 'FeatureCollection'
          ? {
              type: 'MultiLineString' as const,
              coordinates: line.features.flatMap((g) =>
                g.geometry.type === 'LineString' ? [g.geometry.coordinates] : g.geometry.coordinates,
              ),
            }
          : line.geometry
      return {
        type: 'Feature',
        geometry,
        properties: { name: CANTON_NAMES[i] },
      }
    }),
  }

  const cantonCenters: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: cantonsGeo.features.map((f, i) => ({
      type: 'Feature',
      geometry: pointOnFeature(f).geometry,
      properties: { name: CANTON_NAMES[i] },
    })),
  }

  // Switzerland ships as several polygon parts (mainland plus small lake-shared slivers) — merge
  // into one MultiPolygon so mask() can punch all of it out of the world rectangle at once.
  const swissMulti: GeoJSON.MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: countryGeo.features.flatMap((f) =>
      f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
    ),
  }
  const switzerlandMask = mask(
    { type: 'Feature', geometry: swissMulti, properties: {} } as GeoJSON.Feature<GeoJSON.MultiPolygon>,
  )

  const srcDir = join(import.meta.dirname!, '../src')
  writeFileSync(
    join(srcDir, 'canton-borders.ts'),
    `// Generated by scripts/fetch-canton-borders.ts — do not edit by hand.\n\n` +
      `export const cantonBorders: GeoJSON.FeatureCollection = ${JSON.stringify(cantonBorders)}\n\n` +
      `export const cantonCenters: GeoJSON.FeatureCollection = ${JSON.stringify(cantonCenters)}\n`,
  )
  writeFileSync(
    join(srcDir, 'switzerland-mask.ts'),
    `// Generated by scripts/fetch-canton-borders.ts — do not edit by hand.\n\n` +
      `export const switzerlandMask: GeoJSON.Feature<GeoJSON.Polygon> = ${JSON.stringify(switzerlandMask)}\n`,
  )

  console.log('Wrote src/canton-borders.ts and src/switzerland-mask.ts')
}

main()
