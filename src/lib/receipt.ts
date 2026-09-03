/**
 * Receipts.
 *
 * The document model is here and pure, so what a receipt says can be tested
 * without rendering a PDF. Rendering lives in the route handler.
 *
 * One awkward detail drives most of this file: PDF standard fonts (Helvetica
 * and friends) can only encode WinAnsi. A Bangla resident name or the ৳ sign
 * makes `pdf-lib` throw at draw time rather than degrade, so text is either
 * drawn with an embedded Unicode font or made safe first. The check is done
 * per string rather than assumed for the whole document, because most fields
 * are ASCII and only the name is not.
 */

export type ReceiptData = {
  receiptNo: string
  issuedOn: string
  paidOn: string
  amount: number
  method: string
  reference: string | null
  payerName: string
  buildingName: string
  unitNumber: string
  description: string
  period: string
  organisation: string
  gatewayReference: string | null
}

const METHOD_LABELS: Record<string, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  other: 'Other',
}

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method
}

/** True when every character can be drawn with a PDF standard font. */
export function isWinAnsiSafe(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7E\xA0-\xFF\n\r\t]*$/.test(text)
}

/**
 * Makes a string drawable with a standard font, without inventing letters.
 *
 * The taka sign becomes "BDT", which every bank in the country understands.
 * Anything else outside WinAnsi is dropped rather than replaced with question
 * marks, and if that empties the string the caller gets a marker instead of a
 * blank line on a financial document.
 */
export function toPdfSafe(text: string, fallback = '(name in Bangla)'): string {
  if (isWinAnsiSafe(text)) return text

  const stripped = text
    .replace(/৳/g, 'BDT ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return stripped.length > 0 ? stripped : fallback
}

/** Amounts on a receipt are written out so they cannot be misread. */
export function formatAmountForPdf(amount: number): string {
  return `BDT ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(amount)}`
}

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]
const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
]

function underThousand(value: number): string {
  if (value === 0) return ''
  if (value < 20) return ONES[value] ?? ''
  if (value < 100) {
    const tens = TENS[Math.floor(value / 10)] ?? ''
    const ones = ONES[value % 10] ?? ''
    return ones ? `${tens}-${ones}` : tens
  }
  const hundreds = `${ONES[Math.floor(value / 100)]} hundred`
  const rest = underThousand(value % 100)
  return rest ? `${hundreds} ${rest}` : hundreds
}

/**
 * "Taka twenty-four thousand five hundred only" — the line a landlord's
 * accountant looks for, and the one that stops a 2 becoming a 20 in ink.
 *
 * Grouped the South Asian way: crore, lakh, thousand.
 */
export function amountInWords(amount: number): string {
  const whole = Math.floor(Math.abs(amount))
  const paisa = Math.round((Math.abs(amount) - whole) * 100)

  if (whole === 0 && paisa === 0) return 'Taka zero only'

  const crore = Math.floor(whole / 10_000_000)
  const lakh = Math.floor((whole % 10_000_000) / 100_000)
  const thousand = Math.floor((whole % 100_000) / 1000)
  const rest = whole % 1000

  const parts: string[] = []
  if (crore) parts.push(`${underThousand(crore)} crore`)
  if (lakh) parts.push(`${underThousand(lakh)} lakh`)
  if (thousand) parts.push(`${underThousand(thousand)} thousand`)
  if (rest) parts.push(underThousand(rest))

  const words = parts.join(' ').replace(/\s+/g, ' ').trim()
  const capitalised = words.charAt(0).toUpperCase() + words.slice(1)

  return paisa > 0
    ? `Taka ${capitalised} and ${underThousand(paisa)} paisa only`
    : `Taka ${capitalised} only`
}

/** The rows printed on the receipt body, in order. */
export function receiptRows(data: ReceiptData): [string, string][] {
  return [
    ['Receipt number', data.receiptNo],
    ['Issued', data.issuedOn],
    ['Received from', data.payerName],
    ['Flat', `${data.unitNumber}, ${data.buildingName}`],
    ['For', data.description],
    ['Period', data.period],
    ['Paid on', data.paidOn],
    ['Method', methodLabel(data.method)],
    ['Reference', data.reference ?? data.gatewayReference ?? '—'],
  ]
}
