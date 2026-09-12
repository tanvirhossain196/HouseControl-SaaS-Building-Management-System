import { NextResponse, type NextRequest } from 'next/server'

import { requireUser, createServerSupabase } from '@/lib/supabase/server'
import { fail } from '@/lib/api/response'
import { notFound } from '@/lib/errors'
import { planById, quote, type PlanId } from '@/lib/pricing'
import { buildInvoicePdf, invoiceNumberFor, type InvoiceData } from '@/lib/invoice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The PDF invoice for one subscription payment.
 *
 * Access is decided by RLS. The query runs as the signed-in person, and the
 * policy on subscription_payments only admits active admins of the owning
 * organization, so there is no permission check here — there is no way to
 * widen the query.
 *
 * Looked up by transaction id rather than row id because that is the number
 * the customer can see: it is on the billing page, in the confirmation email,
 * and on their bank statement.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { transactionId: string } },
) {
  try {
    const user = await requireUser()
    const supabase = createServerSupabase()

    const { data, error } = await supabase
      .from('subscription_payments')
      .select(
        'plan, months, amount, status, transaction_id, provider, provider_reference, paid_at, created_at, org_id, organizations(name)',
      )
      .eq('transaction_id', params.transactionId)
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('That invoice')

    // The embedded select is not expressible in the hand-written Database type.
    const row = data as unknown as {
      plan: string
      months: number
      amount: number
      status: string
      transaction_id: string
      provider: string | null
      provider_reference: string | null
      paid_at: string | null
      created_at: string
      organizations: { name: string } | null
    }

    if (row.status !== 'confirmed') {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'conflict',
            message: 'An invoice exists only once the payment is confirmed.',
          },
        },
        { status: 409 },
      )
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle()

    const plan = planById(row.plan)
    const pricing = quote(row.plan as PlanId, row.months)
    const issuedOn = (row.paid_at ?? row.created_at).slice(0, 10)

    const invoice: InvoiceData = {
      invoiceNo: invoiceNumberFor(row.transaction_id),
      transactionId: row.transaction_id,
      issuedOn,
      planName: plan?.name ?? row.plan,
      months: row.months,
      amount: Number(row.amount),
      listPrice: pricing.listPrice,
      discountPercent: pricing.discount,
      organisation: row.organizations?.name ?? 'HouseControl',
      billedTo: profile?.full_name ?? 'Customer',
      email: profile?.email ?? user.email ?? '—',
      method:
        row.provider === 'sslcommerz'
          ? 'Online (SSLCommerz)'
          : row.provider === 'zinipay'
            ? 'Online (ZiniPay)'
            : (row.provider ?? 'Online'),
      gatewayReference: row.provider_reference,
      periodStart: null,
      periodEnd: null,
    }

    const bytes = await buildInvoicePdf(invoice)

    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.invoiceNo}.pdf"`,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch (error) {
    return fail(error)
  }
}
