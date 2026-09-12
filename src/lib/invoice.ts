import 'server-only'

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

import { toPdfSafe } from '@/lib/receipt'
import { formatDay } from '@/lib/subscription'

/**
 * The subscription invoice, as a PDF.
 *
 * Two callers need the same document — the download link on the billing page
 * and the confirmation email — so it lives here rather than in a route.
 *
 * Every figure is passed in by the caller from our own `subscription_payments`
 * row, never from the gateway's redirect. The gateway confirms that money
 * moved; what it was for is ours to say.
 */

export type InvoiceData = {
  invoiceNo: string
  transactionId: string
  issuedOn: string
  planName: string
  months: number
  /** Charged total, in BDT. */
  amount: number
  /** Undiscounted price, so the saving can be shown. */
  listPrice: number
  discountPercent: number
  organisation: string
  billedTo: string
  email: string
  method: string
  gatewayReference: string | null
  periodStart: string | null
  periodEnd: string | null

  /**
   * Wording. The layout is shared between the subscription invoice and the
   * rent-handover receipt because keeping two of them looking right is twice
   * the work — but a receipt that calls itself an invoice, bills someone for
   * money they have already handed over and closes with a note about
   * subscription renewals is worse than no document at all.
   *
   * Everything below is optional and falls back to the invoice wording.
   */
  kind?: 'invoice' | 'receipt'
  /** Under the brand: "Subscription billing", "Rent handover". */
  subtitle?: string
  /** Replaces "<plan> plan, N months" on the line item. */
  lineDescription?: string
  /** Replaces the date range under the line item. */
  coverage?: string
  /** Replaces "BILLED TO". */
  partyLabel?: string
  /** Replaces the closing notes. */
  notes?: string[]
  /** Extra label/value pairs in the details column. */
  extraDetails?: Array<[string, string]>
}

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 52
const RIGHT = A4[0] - MARGIN

const INK = rgb(0.07, 0.1, 0.17)
const MUTED = rgb(0.42, 0.46, 0.55)
const LINE = rgb(0.88, 0.9, 0.94)
const WASH = rgb(0.97, 0.975, 0.985)
const BRAND = rgb(0.18, 0.29, 0.85)
const PAID = rgb(0.06, 0.5, 0.32)

/** "BDT 2,700.00" — the taka sign has no glyph in the standard PDF fonts. */
export function money(amount: number): string {
  return `BDT ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function invoiceNumberFor(transactionId: string): string {
  return `INV-${transactionId}`
}

/** Bengali, plus the marks and digits that travel with it. */
const BENGALI = /[\u0980-\u09FF]/

/**
 * Splits a string into runs of one script.
 *
 * Noto Sans Bengali carries no Latin letters, and Helvetica carries no Bangla
 * ones, so whichever font is chosen for a whole line, a mixed line loses half
 * of itself to empty boxes. Drawing run by run is what lets "রহিম Uddin" come
 * out as written. It also fixes a subtler case: before this, one em dash in
 * "Plus — 1 month" was enough to push the entire line into the Bangla font and
 * print it as ten boxes.
 */
function runs(text: string): Array<{ text: string; bengali: boolean }> {
  const out: Array<{ text: string; bengali: boolean }> = []

  for (const char of text) {
    const bengali = BENGALI.test(char)
    const last = out[out.length - 1]

    if (last && last.bengali === bengali) {
      last.text += char
    } else {
      out.push({ text: char, bengali })
    }
  }

  return out
}

async function loadBengaliFont(pdf: PDFDocument): Promise<PDFFont | null> {
  try {
    const file = path.join(
      process.cwd(),
      'public',
      'fonts',
      'NotoSansBengali-Regular.ttf',
    )
    const bytes = await readFile(file)
    pdf.registerFontkit(fontkit)
    return await pdf.embedFont(bytes, { subset: true })
  } catch {
    return null
  }
}

type Writer = {
  draw: (
    text: string,
    options: { x: number; y: number; size: number; bold?: boolean; color?: ReturnType<typeof rgb> },
  ) => void
  width: (text: string, size: number, bold?: boolean) => number
}

function makeWriter(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  bengali: PDFFont | null,
): Writer {
  /** Latin runs go through toPdfSafe so smart quotes and dashes survive. */
  const prepare = (run: { text: string; bengali: boolean }) =>
    run.bengali && bengali ? run.text : toPdfSafe(run.text, '')

  const fontFor = (run: { bengali: boolean }, isBold: boolean) =>
    run.bengali && bengali ? bengali : isBold ? bold : regular

  const width = (text: string, size: number, isBold = false) =>
    runs(text).reduce((total, run) => {
      const value = prepare(run)
      if (!value) return total
      return total + fontFor(run, isBold).widthOfTextAtSize(value, size)
    }, 0)

  const draw: Writer['draw'] = (text, options) => {
    let x = options.x

    for (const run of runs(text)) {
      const value = prepare(run)
      if (!value) continue

      const font = fontFor(run, Boolean(options.bold))

      page.drawText(value, {
        x,
        y: options.y,
        size: options.size,
        font,
        color: options.color ?? INK,
      })

      x += font.widthOfTextAtSize(value, options.size)
    }
  }

  return { draw, width }
}

export async function buildInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Invoice ${data.invoiceNo}`)
  pdf.setSubject(`${data.planName} subscription`)
  pdf.setProducer('HouseControl')

  const bengali = await loadBengaliFont(pdf)
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const page = pdf.addPage(A4)
  const { draw, width } = makeWriter(page, regular, bold, bengali)

  const right = (text: string, size: number, isBold = false) =>
    RIGHT - width(text, size, isBold)

  const rule = (y: number) =>
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: RIGHT, y },
      thickness: 1,
      color: LINE,
    })

  let y = A4[1] - MARGIN

  // ---------------------------------------------------------------- masthead
  page.drawRectangle({ x: 0, y: A4[1] - 5, width: A4[0], height: 5, color: BRAND })

  const heading = data.kind === 'receipt' ? 'RECEIPT' : 'INVOICE'

  draw('HouseControl', { x: MARGIN, y, size: 17, bold: true })
  draw(data.subtitle ?? 'Subscription billing', {
    x: MARGIN,
    y: y - 15,
    size: 9.5,
    color: MUTED,
  })

  draw(heading, { x: right(heading, 11, true), y, size: 11, bold: true, color: BRAND })
  draw(data.invoiceNo, {
    x: right(data.invoiceNo, 9.5),
    y: y - 15,
    size: 9.5,
    color: MUTED,
  })

  y -= 42
  rule(y)

  // ------------------------------------------------------- billed to / meta
  y -= 22
  const columnTwo = MARGIN + 285

  draw(data.partyLabel ?? 'BILLED TO', {
    x: MARGIN,
    y,
    size: 8,
    bold: true,
    color: MUTED,
  })
  draw(data.kind === 'receipt' ? 'RECEIPT DETAILS' : 'INVOICE DETAILS', {
    x: columnTwo,
    y,
    size: 8,
    bold: true,
    color: MUTED,
  })

  y -= 16
  draw(data.billedTo, { x: MARGIN, y, size: 11, bold: true })
  draw('Issued', { x: columnTwo, y, size: 9.5, color: MUTED })
  draw(formatDay(data.issuedOn), { x: columnTwo + 92, y, size: 9.5 })

  y -= 14
  draw(data.email, { x: MARGIN, y, size: 9.5, color: MUTED })
  draw('Method', { x: columnTwo, y, size: 9.5, color: MUTED })
  draw(data.method, { x: columnTwo + 92, y, size: 9.5 })

  y -= 14
  draw(data.organisation, { x: MARGIN, y, size: 9.5, color: MUTED })
  draw('Transaction', { x: columnTwo, y, size: 9.5, color: MUTED })
  draw(data.transactionId, { x: columnTwo + 92, y, size: 9.5 })

  if (data.gatewayReference) {
    y -= 14
    draw('Reference', { x: columnTwo, y, size: 9.5, color: MUTED })
    draw(data.gatewayReference, { x: columnTwo + 92, y, size: 9.5 })
  }

  for (const [label, value] of data.extraDetails ?? []) {
    y -= 14
    draw(label, { x: columnTwo, y, size: 9.5, color: MUTED })
    draw(value, { x: columnTwo + 92, y, size: 9.5 })
  }

  // ------------------------------------------------------------- line items
  y -= 34

  page.drawRectangle({
    x: MARGIN,
    y: y - 8,
    width: RIGHT - MARGIN,
    height: 26,
    color: WASH,
  })

  draw('DESCRIPTION', { x: MARGIN + 12, y, size: 8, bold: true, color: MUTED })
  draw('AMOUNT', {
    x: right('AMOUNT', 8, true) - 12,
    y,
    size: 8,
    bold: true,
    color: MUTED,
  })

  y -= 30
  const term =
    data.lineDescription ??
    `${data.planName} plan, ${data.months} month${data.months === 1 ? '' : 's'}`
  draw(term, { x: MARGIN + 12, y, size: 10.5 })
  draw(money(data.listPrice), {
    x: right(money(data.listPrice), 10.5) - 12,
    y,
    size: 10.5,
  })

  const coverage =
    data.coverage ??
    (data.periodStart && data.periodEnd
      ? `${formatDay(data.periodStart)} to ${formatDay(data.periodEnd)}`
      : null)

  if (coverage) {
    y -= 13
    draw(coverage, { x: MARGIN + 12, y, size: 9, color: MUTED })
  }

  y -= 20
  rule(y)

  // ----------------------------------------------------------------- totals
  const totalRow = (label: string, value: string, options?: { strong?: boolean }) => {
    y -= options?.strong ? 24 : 18
    const size = options?.strong ? 12 : 9.5

    draw(label, {
      x: right(value, size, options?.strong) - 16 - width(label, size, options?.strong),
      y,
      size,
      bold: options?.strong,
      color: options?.strong ? INK : MUTED,
    })
    draw(value, {
      x: right(value, size, options?.strong),
      y,
      size,
      bold: options?.strong,
    })
  }

  totalRow('Subtotal', money(data.listPrice))

  if (data.discountPercent > 0) {
    totalRow(
      `Multi-month discount (${data.discountPercent}%)`,
      `- ${money(data.listPrice - data.amount)}`,
    )
  }

  y -= 8
  rule(y)
  totalRow('Total paid', money(data.amount), { strong: true })

  // The status sits opposite the total, where an eye looking for it lands.
  draw('PAID', { x: MARGIN, y, size: 11, bold: true, color: PAID })

  // ----------------------------------------------------------------- footer
  y -= 44
  rule(y)

  y -= 18
  const notes = data.notes ?? [
    'Paid in full. This invoice is generated by HouseControl and needs no signature.',
    'Subscriptions do not renew automatically. Nothing is charged again on the end date.',
    `Questions about this invoice? Reply quoting ${data.invoiceNo}.`,
  ]

  for (const note of notes) {
    draw(note, { x: MARGIN, y, size: 8.5, color: MUTED })
    y -= 12
  }

  return pdf.save()
}