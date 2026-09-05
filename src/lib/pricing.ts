/**
 * Plans and what they cost.
 *
 * Three tiers and four billing periods, with the discount growing as the
 * commitment does. The arithmetic is here and pure because a price shown on
 * the marketing page, a total on the upgrade screen and the figure sent to
 * WhatsApp must be the same number — three places computing it separately is
 * how a customer is quoted one price and charged another.
 *
 * `npm run test:pricing` covers it.
 */

export type PlanId = 'free' | 'plus' | 'pro'

export type Plan = {
  id: PlanId
  name: string
  nameBn: string
  /** Taka per month, billed monthly. Discounts come off this. */
  monthly: number
  tagline: string
  taglineBn: string
  buildings: number | 'unlimited'
  units: number | 'unlimited'
  features: string[]
  featuresBn: string[]
  /** What this tier does not include, said plainly. */
  missing: string[]
  featured: boolean
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    nameBn: 'ফ্রি',
    monthly: 0,
    tagline: 'One building, twelve units. Enough to run a family walk-up.',
    taglineBn: 'একটি বিল্ডিং, ১২টি ইউনিট। পারিবারিক বাড়ির জন্য যথেষ্ট।',
    buildings: 1,
    units: 12,
    features: [
      '1 building, up to 12 units',
      'Rent, dues and shared bills',
      'Residents and rent splitting',
      'Gate register and visitor log',
      'Complaints and repairs',
      'Manual payment confirmation',
      'Email reminders',
    ],
    featuresBn: [
      '১টি বিল্ডিং, সর্বোচ্চ ১২টি ইউনিট',
      'ভাড়া, বকেয়া ও শেয়ার্ড বিল',
      'ভাড়াটিয়া ও ভাড়া ভাগাভাগি',
      'গেট রেজিস্টার ও ভিজিটর লগ',
      'অভিযোগ ও মেরামত',
      'হাতে পেমেন্ট নিশ্চিত করা',
      'ইমেইল রিমাইন্ডার',
    ],
    missing: ['Online payments', 'SMS alerts', 'PDF statements'],
    featured: false,
  },
  {
    id: 'plus',
    name: 'Plus',
    nameBn: 'প্লাস',
    monthly: 500,
    tagline: 'For one full building, with money coming in online.',
    taglineBn: 'একটি পূর্ণ বিল্ডিংয়ের জন্য, অনলাইন পেমেন্ট সহ।',
    buildings: 1,
    units: 40,
    features: [
      'Everything in Free',
      '1 building, up to 40 units',
      'bKash, Nagad, card and bank payments',
      'PDF receipts and monthly statements',
      'SMS reminders for overdue rent',
      'Reports: collection, arrears ageing, expenses',
      'CSV exports for your accountant',
    ],
    featuresBn: [
      'ফ্রি-এর সবকিছু',
      '১টি বিল্ডিং, সর্বোচ্চ ৪০টি ইউনিট',
      'বিকাশ, নগদ, কার্ড ও ব্যাংক পেমেন্ট',
      'পিডিএফ রসিদ ও মাসিক স্টেটমেন্ট',
      'বকেয়া ভাড়ার এসএমএস রিমাইন্ডার',
      'রিপোর্ট: আদায়, বকেয়ার বয়স, খরচ',
      'হিসাবরক্ষকের জন্য সিএসভি এক্সপোর্ট',
    ],
    missing: ['More than one building', 'Audit log export'],
    featured: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    nameBn: 'প্রো',
    monthly: 1000,
    tagline: 'Several buildings, several caretakers, one set of books.',
    taglineBn: 'একাধিক বিল্ডিং, একাধিক কেয়ারটেকার, একটাই হিসাব।',
    buildings: 'unlimited',
    units: 'unlimited',
    features: [
      'Everything in Plus',
      'Unlimited buildings and units',
      'Unlimited guards and moderators',
      'Audit log with CSV export',
      'Landlord rent tracking',
      'Priority support in Bangla and English',
      'Data export and backup on request',
    ],
    featuresBn: [
      'প্লাস-এর সবকিছু',
      'সীমাহীন বিল্ডিং ও ইউনিট',
      'সীমাহীন গার্ড ও মডারেটর',
      'সিএসভি এক্সপোর্ট সহ অডিট লগ',
      'বাড়িওয়ালার ভাড়ার হিসাব',
      'বাংলা ও ইংরেজিতে অগ্রাধিকার সাপোর্ট',
      'চাহিদামতো ডেটা এক্সপোর্ট ও ব্যাকআপ',
    ],
    missing: [],
    featured: false,
  },
]

export type BillingPeriod = {
  months: number
  label: string
  labelBn: string
  /** Percentage off the monthly rate. */
  discount: number
  popular?: boolean
}

/**
 * The discount grows with the commitment, and stops at 20%.
 *
 * Past a fifth off, a year up front stops looking like a discount and starts
 * looking like the monthly price was invented — which is the impression that
 * loses the customer who was going to pay monthly.
 */
export const PERIODS: BillingPeriod[] = [
  { months: 1, label: 'Monthly', labelBn: 'মাসিক', discount: 0 },
  { months: 3, label: '3 months', labelBn: '৩ মাস', discount: 5 },
  { months: 6, label: '6 months', labelBn: '৬ মাস', discount: 10, popular: true },
  { months: 12, label: '1 year', labelBn: '১ বছর', discount: 20 },
]

export type Quote = {
  planId: PlanId
  months: number
  /** What it would cost with no discount. */
  listPrice: number
  /** What it costs. */
  total: number
  saved: number
  discount: number
  /** The figure people compare between plans. */
  effectiveMonthly: number
}

/**
 * Quotes a plan for a period.
 *
 * Rounded to whole taka, and the effective monthly is rounded too — an
 * invoice that says ৳666.67 for something paid in one lump is arithmetic
 * showing through the product.
 */
export function quote(planId: PlanId, months: number): Quote {
  const plan = PLANS.find((candidate) => candidate.id === planId) ?? PLANS[0]!
  const period = PERIODS.find((candidate) => candidate.months === months) ?? PERIODS[0]!

  const listPrice = plan.monthly * period.months
  const total = Math.round((listPrice * (100 - period.discount)) / 100)

  return {
    planId: plan.id,
    months: period.months,
    listPrice,
    total,
    saved: listPrice - total,
    discount: period.discount,
    effectiveMonthly: period.months > 0 ? Math.round(total / period.months) : 0,
  }
}

/** "৳4,000" — the only place plan prices are formatted. */
export function taka(amount: number): string {
  return `৳${new Intl.NumberFormat('en-US').format(Math.round(amount))}`
}

export function planById(id: string): Plan | null {
  return PLANS.find((plan) => plan.id === id) ?? null
}

/** What a plan allows, for the limit checks in the services. */
export function limitsFor(planId: PlanId): { buildings: number; units: number } {
  const plan = planById(planId) ?? PLANS[0]!
  return {
    buildings: plan.buildings === 'unlimited' ? 999 : plan.buildings,
    units: plan.units === 'unlimited' ? 100_000 : plan.units,
  }
}
