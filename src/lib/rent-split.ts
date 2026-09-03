/**
 * Rent splitting.
 *
 * A flat's rent is one number; the people living in it pay parts of it. The
 * parts must add up exactly — a flat billed 24,500 must never produce three
 * dues of 8,166.66 that quietly lose two paisa a month.
 *
 * Money is handled in paisa (integers) inside these functions and converted
 * back at the edges, because 0.1 + 0.2 is not 0.3 in binary floating point.
 *
 * Pure, so `npm run test:rent` checks it without a database.
 */

/** Taka to paisa, rounded to the nearest paisa. */
export function toPaisa(taka: number): number {
  return Math.round(taka * 100)
}

/** Paisa back to taka, with two decimals. */
export function toTaka(paisa: number): number {
  return Math.round(paisa) / 100
}

/**
 * Splits an amount into `count` shares that add up exactly.
 *
 * The remainder goes to the earliest shares, one paisa each, so 100 split
 * three ways is 33.34, 33.33, 33.33 rather than three equal shares plus a
 * missing paisa. Whoever is listed first carries the extra, which is at most
 * one paisa a month and stays stable between months.
 */
export function splitEqually(total: number, count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [Number(total.toFixed(2))]

  const totalPaisa = toPaisa(total)
  const base = Math.floor(totalPaisa / count)
  const remainder = totalPaisa - base * count

  return Array.from({ length: count }, (_, index) =>
    toTaka(base + (index < remainder ? 1 : 0)),
  )
}

/**
 * Splits in proportion to weights — floor area, or the number of people in
 * each room. Zero-weight entries get nothing; the remainder follows the same
 * earliest-first rule so the total is exact.
 */
export function splitByWeight(total: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0)
  if (totalWeight <= 0) return splitEqually(total, weights.length)

  const totalPaisa = toPaisa(total)
  const raw = weights.map((weight) => (Math.max(0, weight) / totalWeight) * totalPaisa)
  const floored = raw.map(Math.floor)
  let remainder = totalPaisa - floored.reduce((sum, value) => sum + value, 0)

  // Hand the leftover paisa to the shares with the largest fractional part.
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  const result = [...floored]
  for (const { index } of order) {
    if (remainder <= 0) break
    result[index] = (result[index] ?? 0) + 1
    remainder -= 1
  }

  return result.map(toTaka)
}

export type ShareCheck =
  | { ok: true; total: number }
  | { ok: false; total: number; difference: number; message: string }

/**
 * The rule the database also enforces: shares must add up to the flat's rent.
 * Returns the shortfall or excess so the form can say which, and by how much.
 */
export function checkShares(shares: number[], flatRent: number): ShareCheck {
  const totalPaisa = shares.reduce((sum, share) => sum + toPaisa(share), 0)
  const rentPaisa = toPaisa(flatRent)
  const total = toTaka(totalPaisa)

  if (totalPaisa === rentPaisa) return { ok: true, total }

  const difference = toTaka(totalPaisa - rentPaisa)
  return {
    ok: false,
    total,
    difference,
    message:
      difference > 0
        ? `Shares are over the flat rent by ৳${Math.abs(difference).toLocaleString('en-BD')}.`
        : `Shares are short of the flat rent by ৳${Math.abs(difference).toLocaleString('en-BD')}.`,
  }
}

/**
 * Re-splits after someone moves out: the people who remain keep their shares
 * in the same proportion to each other, and the leaver's part is spread over
 * them. Passing an empty list returns an empty list rather than dividing by
 * zero — a flat with nobody in it owes nothing to anyone.
 */
export function redistribute(
  remaining: { id: string; share: number }[],
  flatRent: number,
): { id: string; share: number }[] {
  if (remaining.length === 0) return []

  const weights = remaining.map((person) => person.share)
  const shares = weights.every((weight) => weight === 0)
    ? splitEqually(flatRent, remaining.length)
    : splitByWeight(flatRent, weights)

  return remaining.map((person, index) => ({ id: person.id, share: shares[index] ?? 0 }))
}
