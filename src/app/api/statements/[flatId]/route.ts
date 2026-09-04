import { NextResponse, type NextRequest } from 'next/server'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { requireUser } from '@/lib/supabase/server'
import { fail } from '@/lib/api/response'
import { flatStatement } from '@/services/reports.service'
import { periodLabel, periodOf } from '@/lib/billing'
import {
  amountInWords,
  formatAmountForPdf,
  isWinAnsiSafe,
  toPdfSafe,
} from '@/lib/receipt'

/**
 * A month's statement for one flat, as a PDF.
 *
 * This is the document an owner sends to a landlord or an accountant, so it
 * has to balance: opening plus charges minus payments equals closing, on
 * every line and at the foot. `buildStatement` does that arithmetic and is
 * tested; this file only draws it.
 *
 * Access is RLS again — a resident can pull their own flat's statement, a
 * moderator their flat's, an owner any of theirs, and nobody else's.
 */
const A4: [number, number] = [595.28, 841.89]
const MARGIN = 48

export async function GET(
  request: NextRequest,
  { params }: { params: { flatId: string } },
) {
  try {
    await requireUser()

    const requested = request.nextUrl.searchParams.get('period')
    const period = /^\d{4}-\d{2}-01$/.test(requested ?? '') ? requested! : periodOf()

    const [year, month] = period.split('-').map(Number)
    const to = new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10)

    const statement = await flatStatement(params.flatId, period, to)

    const pdf = await PDFDocument.create()
    pdf.setTitle(`Statement ${statement.unitNumber} ${period.slice(0, 7)}`)
    pdf.setProducer('HouseControl')

    const page = pdf.addPage(A4)
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

    const ink = rgb(0.07, 0.1, 0.17)
    const muted = rgb(0.35, 0.38, 0.48)
    const line = rgb(0.88, 0.9, 0.94)
    const brand = rgb(0.18, 0.29, 0.85)

    // Standard PDF fonts cannot draw Bangla; make every string safe first
    // rather than discovering it mid-render on a financial document.
    const draw = (
      text: string,
      options: {
        x: number
        y: number
        size?: number
        bold?: boolean
        color?: ReturnType<typeof rgb>
      },
    ) => {
      page.drawText(isWinAnsiSafe(text) ? text : toPdfSafe(text), {
        x: options.x,
        y: options.y,
        size: options.size ?? 10,
        font: options.bold ? bold : regular,
        color: options.color ?? ink,
      })
    }

    const right = (text: string, x: number, y: number, isBold = false) => {
      const font = isBold ? bold : regular
      const safe = isWinAnsiSafe(text) ? text : toPdfSafe(text)
      draw(safe, { x: x - font.widthOfTextAtSize(safe, 10), y, bold: isBold })
    }

    let y = A4[1] - MARGIN
    page.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: brand })

    draw('HouseControl', { x: MARGIN, y, size: 17, bold: true })
    draw(`Statement — ${periodLabel(period)}`, { x: MARGIN, y: y - 16, color: muted })

    right(`Flat ${statement.unitNumber}`, A4[0] - MARGIN, y)
    right(statement.buildingName, A4[0] - MARGIN, y - 16)

    y -= 40
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 1,
      color: line,
    })

    y -= 24
    draw('Brought forward', { x: MARGIN, y, color: muted })
    right(formatAmountForPdf(statement.opening), A4[0] - MARGIN, y, true)

    y -= 28
    const columns = {
      date: MARGIN,
      detail: MARGIN + 70,
      charged: 400,
      paid: 470,
      balance: A4[0] - MARGIN,
    }

    draw('Date', { x: columns.date, y, bold: true, size: 9, color: muted })
    draw('Detail', { x: columns.detail, y, bold: true, size: 9, color: muted })
    right('Charged', columns.charged, y, true)
    right('Paid', columns.paid, y, true)
    right('Balance', columns.balance, y, true)

    y -= 8
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 1,
      color: line,
    })
    y -= 18

    for (const entry of statement.lines) {
      if (y < MARGIN + 90) break // one page; the CSV export carries the long tail

      draw(entry.date, { x: columns.date, y, size: 9 })
      draw(entry.description.slice(0, 42), { x: columns.detail, y, size: 9 })
      right(entry.charge ? formatAmountForPdf(entry.charge) : '', columns.charged, y)
      right(entry.payment ? formatAmountForPdf(entry.payment) : '', columns.paid, y)
      right(formatAmountForPdf(entry.balance), columns.balance, y)

      y -= 18
    }

    y -= 6
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 1,
      color: line,
    })

    y -= 24
    draw('Charged this period', { x: MARGIN, y, color: muted })
    right(formatAmountForPdf(statement.charged), A4[0] - MARGIN, y)

    y -= 18
    draw('Paid this period', { x: MARGIN, y, color: muted })
    right(formatAmountForPdf(statement.paid), A4[0] - MARGIN, y)

    y -= 24
    draw('Balance owing', { x: MARGIN, y, size: 12, bold: true })
    right(formatAmountForPdf(statement.closing), A4[0] - MARGIN, y, true)

    y -= 18
    draw(amountInWords(statement.closing), { x: MARGIN, y, size: 9, color: muted })

    y -= 30
    draw('Charges and payments as recorded in HouseControl. No signature is needed.', {
      x: MARGIN,
      y,
      size: 9,
      color: muted,
    })

    const bytes = await pdf.save()

    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="statement-${statement.unitNumber}-${period.slice(0, 7)}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return fail(error)
  }
}

export const dynamic = 'force-dynamic'
