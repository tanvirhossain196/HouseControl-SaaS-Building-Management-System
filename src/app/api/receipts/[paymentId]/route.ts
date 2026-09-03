import { NextResponse, type NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { requireUser } from '@/lib/supabase/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { fail } from '@/lib/api/response'
import { notFound } from '@/lib/errors'
import { periodLabel } from '@/lib/billing'
import {
  amountInWords,
  formatAmountForPdf,
  isWinAnsiSafe,
  receiptRows,
  toPdfSafe,
  type ReceiptData,
} from '@/lib/receipt'

/**
 * The PDF receipt for one confirmed payment.
 *
 * Access is decided by RLS: the query below runs as the signed-in user, so a
 * resident gets their own receipts, a moderator gets their flat's, and nobody
 * gets anyone else's. There is no separate permission check because there is
 * no way to widen the query.
 *
 * Unicode: standard PDF fonts cannot draw Bangla. If a Bangla-capable font is
 * present at public/fonts/NotoSansBengali-Regular.ttf it is embedded and names
 * print as written; otherwise the text is made WinAnsi-safe first, which is
 * ugly for a Bangla name but never throws mid-render on a financial document.
 */

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 56

async function loadUnicodeFont(pdf: PDFDocument): Promise<PDFFont | null> {
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

export async function GET(
  _request: NextRequest,
  { params }: { params: { paymentId: string } },
) {
  try {
    await requireUser()
    const supabase = createServerSupabase()

    const { data, error } = await supabase
      .from('payments')
      .select(
        'id, amount, method, paid_at, reference, receipt_no, status, bank_transaction_id, reviewed_at, profiles(full_name), dues(description, period), flats(unit_number, buildings(name, organizations(name)))',
      )
      .eq('id', params.paymentId)
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('That receipt')

    // Embedded selects are not expressible in the hand-written Database type.
    const row = data as unknown as {
      amount: number
      method: string
      paid_at: string
      reference: string | null
      receipt_no: string | null
      status: string
      bank_transaction_id: string | null
      reviewed_at: string | null
      profiles: { full_name: string } | null
      dues: { description: string | null; period: string } | null
      flats: {
        unit_number: string
        buildings: { name: string; organizations: { name: string } | null } | null
      } | null
    }

    if (row.status !== 'confirmed' || !row.receipt_no) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'conflict',
            message: 'A receipt exists only once the payment is confirmed.',
          },
        },
        { status: 409 },
      )
    }

    const receipt: ReceiptData = {
      receiptNo: row.receipt_no,
      issuedOn: (row.reviewed_at ?? new Date().toISOString()).slice(0, 10),
      paidOn: row.paid_at,
      amount: Number(row.amount),
      method: row.method,
      reference: row.reference,
      payerName: row.profiles?.full_name ?? 'Resident',
      buildingName: row.flats?.buildings?.name ?? 'Building',
      unitNumber: row.flats?.unit_number ?? '—',
      description: row.dues?.description ?? 'Rent',
      period: row.dues ? periodLabel(row.dues.period) : '—',
      organisation: row.flats?.buildings?.organizations?.name ?? 'HouseControl',
      gatewayReference: row.bank_transaction_id,
    }

    const pdf = await PDFDocument.create()
    pdf.setTitle(`Receipt ${receipt.receiptNo}`)
    pdf.setProducer('HouseControl')

    const unicode = await loadUnicodeFont(pdf)
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

    const page = pdf.addPage(A4)
    const ink = rgb(0.07, 0.1, 0.17)
    const muted = rgb(0.35, 0.38, 0.48)
    const line = rgb(0.88, 0.9, 0.94)
    const brand = rgb(0.18, 0.29, 0.85)

    /** Draws text, falling back to a safe rendering when the font cannot. */
    const draw = (
      text: string,
      options: {
        x: number
        y: number
        size: number
        bold?: boolean
        color?: ReturnType<typeof rgb>
      },
    ) => {
      const useUnicode = unicode && !isWinAnsiSafe(text)
      const font = useUnicode ? unicode : options.bold ? bold : regular
      page.drawText(useUnicode ? text : toPdfSafe(text), {
        x: options.x,
        y: options.y,
        size: options.size,
        font,
        color: options.color ?? ink,
      })
    }

    let y = A4[1] - MARGIN

    page.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: brand })

    draw('HouseControl', { x: MARGIN, y, size: 18, bold: true })
    draw(receipt.organisation, { x: MARGIN, y: y - 16, size: 10, color: muted })

    const heading = 'RENT RECEIPT'
    draw(heading, {
      x: A4[0] - MARGIN - bold.widthOfTextAtSize(heading, 12),
      y,
      size: 12,
      bold: true,
      color: brand,
    })
    draw(receipt.receiptNo, {
      x: A4[0] - MARGIN - regular.widthOfTextAtSize(receipt.receiptNo, 10),
      y: y - 16,
      size: 10,
      color: muted,
    })

    y -= 44
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 1,
      color: line,
    })

    y -= 34
    draw('Amount received', { x: MARGIN, y, size: 10, color: muted })
    y -= 26
    draw(formatAmountForPdf(receipt.amount), { x: MARGIN, y, size: 24, bold: true })
    y -= 20
    draw(amountInWords(receipt.amount), { x: MARGIN, y, size: 10, color: muted })

    y -= 36
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 1,
      color: line,
    })

    y -= 28
    for (const [label, value] of receiptRows(receipt)) {
      draw(label, { x: MARGIN, y, size: 10, color: muted })
      draw(value, { x: MARGIN + 150, y, size: 10 })
      y -= 22
    }

    y -= 14
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: A4[0] - MARGIN, y },
      thickness: 1,
      color: line,
    })

    y -= 26
    draw('This receipt was generated by HouseControl and needs no signature.', {
      x: MARGIN,
      y,
      size: 9,
      color: muted,
    })
    draw('Keep it — it is the record of what this payment settled.', {
      x: MARGIN,
      y: y - 14,
      size: 9,
      color: muted,
    })

    const bytes = await pdf.save()

    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${receipt.receiptNo}.pdf"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    return fail(error)
  }
}

export const dynamic = 'force-dynamic'
