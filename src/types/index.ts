export * from './database'

/** A flat with the fields list screens need, joined from building + members. */
export type FlatSummary = {
  id: string
  unitNumber: string
  floor: number
  monthlyRent: number
  occupancy: import('./database').OccupancyStatus
  residentCount: number
  moderatorName: string | null
  outstanding: number
}

export type PagedResult<T> = {
  items: T[]
  page: number
  perPage: number
  total: number
  totalPages: number
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
