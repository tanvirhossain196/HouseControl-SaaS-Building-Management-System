/**
 * HouseControl plans and pricing.
 *
 * All plan prices and limits are defined here so the marketing page,
 * billing page, checkout flow and subscription validation always use the
 * same values.
 */

export type PlanId = 'free' | 'plus' | 'pro'

export type Plan = {
  id: PlanId
  name: string
  nameBn: string
  /** Base price in BDT per month. */
  monthly: number
  tagline: string
  taglineBn: string
  buildings: number | 'unlimited'
  units: number | 'unlimited'
  features: string[]
  featuresBn: string[]
  missing: string[]
  featured: boolean
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    nameBn: 'ফ্রি',
    monthly: 0,
    tagline: 'One building, up to four units. Free forever.',
    taglineBn: 'একটি বিল্ডিং, সর্বোচ্চ ৪টি ইউনিট। সবসময় ফ্রি।',
    buildings: 1,
    units: 4,
    features: [
      '1 building, up to 4 units',
      'Rent, dues and shared bills',
      'Residents and rent splitting',
      'Gate register and visitor log',
      'Complaints and repairs',
      'Manual payment confirmation',
      'Email reminders',
    ],
    featuresBn: [
      '১টি বিল্ডিং, সর্বোচ্চ ৪টি ইউনিট',
      'ভাড়া, বকেয়া ও শেয়ার্ড বিল',
      'ভাড়াটিয়া ও ভাড়া ভাগাভাগি',
      'গেট রেজিস্টার ও ভিজিটর লগ',
      'অভিযোগ ও মেরামত',
      'হাতে পেমেন্ট নিশ্চিত করা',
      'ইমেইল রিমাইন্ডার',
    ],
    missing: ['Online subscription payments', 'SMS alerts', 'PDF statements'],
    featured: false,
  },
  {
    id: 'plus',
    name: 'Plus',
    nameBn: 'প্লাস',
    monthly: 500,
    tagline: 'Two buildings with online payment support.',
    taglineBn: 'অনলাইন পেমেন্টসহ দুটি বিল্ডিংয়ের জন্য।',
    buildings: 2,
    units: 34,
    features: [
      'Everything in Free',
      '2 buildings, up to 34 units total',
      'bKash, Nagad, card and bank payments',
      'PDF receipts and monthly statements',
      'SMS reminders for overdue rent',
      'Reports: collection, arrears ageing and expenses',
      'CSV exports for your accountant',
    ],
    featuresBn: [
      'ফ্রি-এর সবকিছু',
      '২টি বিল্ডিং, মোট সর্বোচ্চ ৩৪টি ইউনিট',
      'বিকাশ, নগদ, কার্ড ও ব্যাংক পেমেন্ট',
      'পিডিএফ রসিদ ও মাসিক স্টেটমেন্ট',
      'বকেয়া ভাড়ার এসএমএস রিমাইন্ডার',
      'আদায়, বকেয়া ও খরচের রিপোর্ট',
      'হিসাবরক্ষকের জন্য সিএসভি এক্সপোর্ট',
    ],
    missing: ['More than two buildings', 'Audit log export'],
    featured: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    nameBn: 'প্রো',
    monthly: 1000,
    tagline: 'Several buildings, caretakers and complete organization control.',
    taglineBn: 'একাধিক বিল্ডিং, কেয়ারটেকার ও পূর্ণ সংগঠন নিয়ন্ত্রণ।',
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
      'সিএসভি এক্সপোর্টসহ অডিট লগ',
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
  /** Percentage discount from the base monthly price. */
  discount: number
  popular?: boolean
}

export const PERIODS: BillingPeriod[] = [
  {
    months: 1,
    label: 'Monthly',
    labelBn: 'মাসিক',
    discount: 0,
  },
  {
    months: 3,
    label: '3 months',
    labelBn: '৩ মাস',
    discount: 5,
  },
  {
    months: 6,
    label: '6 months',
    labelBn: '৬ মাস',
    discount: 10,
    popular: true,
  },
  {
    months: 12,
    label: '1 year',
    labelBn: '১ বছর',
    discount: 20,
  },
]

export type Quote = {
  planId: PlanId
  months: number
  listPrice: number
  total: number
  saved: number
  discount: number
  effectiveMonthly: number
}

/**
 * Calculates the exact amount for a selected plan and billing period.
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

/**
 * Formats amounts consistently across pricing and billing pages.
 */
export function taka(amount: number): string {
  return `৳${new Intl.NumberFormat('en-US').format(Math.round(amount))}`
}

export function planById(id: string): Plan | null {
  return PLANS.find((plan) => plan.id === id) ?? null
}

/**
 * Converts product limits into numeric values used by services.
 */
export function limitsFor(planId: PlanId): {
  buildings: number
  units: number
} {
  const plan = planById(planId) ?? PLANS[0]!

  return {
    buildings: plan.buildings === 'unlimited' ? 999 : plan.buildings,

    units: plan.units === 'unlimited' ? 100_000 : plan.units,
  }
}
