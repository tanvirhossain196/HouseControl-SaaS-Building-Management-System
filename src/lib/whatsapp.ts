import { quote, taka, type PlanId } from './pricing'

/**
 * Handing a purchase to WhatsApp.
 *
 * There is no subscription billing in the product yet, and shipping half of
 * one to take real money would be worse than not taking it. So an upgrade
 * ends in a message with everything needed to complete it by hand: who, which
 * plan, for how long, and what it comes to.
 *
 * The message is built here rather than in the component so the figures come
 * from the same `quote()` the page showed — a customer must never be quoted
 * one number on screen and another in the chat.
 */

/** The number payment enquiries go to. */
export const SUPPORT_WHATSAPP = '8801616122600'
export const SUPPORT_PHONE_DISPLAY = '+880 1616-122600'

export type PurchaseEnquiry = {
  planId: PlanId
  planName: string
  months: number
  periodLabel: string
  organisation?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
}

/** The text that arrives on the other end. Plain, and complete on its own. */
export function purchaseMessage(enquiry: PurchaseEnquiry): string {
  const priced = quote(enquiry.planId, enquiry.months)

  const lines = [
    'HouseControl — subscription request',
    '',
    `Plan: ${enquiry.planName}`,
    `Period: ${enquiry.periodLabel} (${priced.months} month${priced.months === 1 ? '' : 's'})`,
    `Total: ${taka(priced.total)}`,
  ]

  if (priced.saved > 0) {
    lines.push(`Discount: ${priced.discount}% — saving ${taka(priced.saved)}`)
  }

  lines.push('')

  if (enquiry.organisation) lines.push(`Organisation: ${enquiry.organisation}`)
  if (enquiry.name) lines.push(`Name: ${enquiry.name}`)
  if (enquiry.email) lines.push(`Email: ${enquiry.email}`)
  if (enquiry.phone) lines.push(`Phone: ${enquiry.phone}`)

  lines.push('', 'Please send the payment details.')

  return lines.join('\n')
}

/**
 * A wa.me link.
 *
 * `encodeURIComponent` rather than a template string: a building called
 * "A&B Properties" would otherwise truncate the message at the ampersand, and
 * the person on the other end would see half an enquiry.
 */
export function whatsappLink(message: string, phone: string = SUPPORT_WHATSAPP): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}

export function purchaseLink(enquiry: PurchaseEnquiry): string {
  return whatsappLink(purchaseMessage(enquiry))
}

/** For the "call us instead" line. Digits only, with the country code. */
export function telLink(phone: string = SUPPORT_WHATSAPP): string {
  return `tel:+${phone.replace(/\D/g, '')}`
}
