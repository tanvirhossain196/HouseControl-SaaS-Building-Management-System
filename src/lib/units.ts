/**
 * Unit numbering.
 *
 * Bangladeshi buildings label floors and units in a few common ways, and the
 * bulk generator has to produce exactly what the owner already writes on the
 * rent register — otherwise every unit gets renamed by hand afterwards.
 *
 * Pure functions, so `npm run test:units` checks them without a database.
 */

export type FloorLabelStyle =
  /** B2, B1, G, 1, 2, 3 — the usual Dhaka walk-up */
  | 'ground_g'
  /** 0, 1, 2, 3 — ground floor as zero */
  | 'ground_zero'
  /** 1, 2, 3 with the ground floor counted as the first */
  | 'ground_one'

export type UnitNumberStyle =
  /** 3A, 3B — floor number then a letter */
  | 'floor_letter'
  /** 301, 302 — floor number then a padded index */
  | 'floor_index'
  /** A-301 style is not generated; owners who use it edit after generating */
  | 'letter_only'

export type BulkPlan = {
  /** Lowest floor, negative for basements. */
  fromFloor: number
  /** Highest floor. */
  toFloor: number
  /** Units on each floor. */
  unitsPerFloor: number
  floorStyle: FloorLabelStyle
  unitStyle: UnitNumberStyle
  /** Floors to leave out — shops on the ground floor, the owner's own flat. */
  skipFloors?: number[]
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** How a floor is written on the sign by the lift. */
export function floorLabel(floor: number, style: FloorLabelStyle): string {
  if (floor < 0) return `B${Math.abs(floor)}`

  switch (style) {
    case 'ground_g':
      return floor === 0 ? 'G' : String(floor)
    case 'ground_zero':
      return String(floor)
    case 'ground_one':
      return String(floor + 1)
  }
}

/** The label a single unit gets. */
export function unitNumber(floor: number, index: number, plan: BulkPlan): string {
  const label = floorLabel(floor, plan.floorStyle)

  switch (plan.unitStyle) {
    case 'floor_letter':
      return `${label}${LETTERS[index] ?? String(index + 1)}`
    case 'floor_index':
      // 3rd floor, 2nd unit -> 302. Ground floor units become G01, G02.
      return floor === 0 && plan.floorStyle === 'ground_g'
        ? `G${String(index + 1).padStart(2, '0')}`
        : `${label}${String(index + 1).padStart(2, '0')}`
    case 'letter_only':
      return LETTERS[index] ?? String(index + 1)
  }
}

export type PlannedUnit = { floor: number; unitNumber: string }

/**
 * Every unit a bulk plan would create, top floor first — the order the units
 * are shown in, so what the owner previews is what they get.
 */
export function planUnits(plan: BulkPlan): PlannedUnit[] {
  const skip = new Set(plan.skipFloors ?? [])
  const units: PlannedUnit[] = []

  for (let floor = plan.toFloor; floor >= plan.fromFloor; floor -= 1) {
    if (skip.has(floor)) continue
    for (let index = 0; index < plan.unitsPerFloor; index += 1) {
      units.push({ floor, unitNumber: unitNumber(floor, index, plan) })
    }
  }

  return units
}

/** Units the plan would create that the building already has. */
export function findCollisions(planned: PlannedUnit[], existing: string[]): string[] {
  const taken = new Set(existing.map((unit) => unit.toUpperCase()))
  return planned
    .filter((unit) => taken.has(unit.unitNumber.toUpperCase()))
    .map((u) => u.unitNumber)
}

/** Sorts unit rows the way a person reads a building: top floor down. */
export function byFloorDescending<T extends { floor: number; unit_number: string }>(
  a: T,
  b: T,
): number {
  if (a.floor !== b.floor) return b.floor - a.floor
  return a.unit_number.localeCompare(b.unit_number, 'en', { numeric: true })
}
