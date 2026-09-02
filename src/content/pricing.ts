export const plans = [
  {
    name: 'Free',
    price: '৳0',
    cadence: 'forever',
    pitch: 'One building, up to 12 units. Enough to run a family-owned walk-up.',
    features: [
      '1 building, 12 units',
      'Rent, dues and expense tracking',
      'Gate register and complaints',
      'Email reminders',
      'Manual payment confirmation',
    ],
    cta: 'Start free',
    featured: false,
  },
  {
    name: 'Pro',
    price: '৳1,500',
    cadence: 'per building, per month',
    pitch:
      'Unlimited units, online payments, SMS alerts and reports your accountant will accept.',
    features: [
      'Unlimited buildings and units',
      'bKash, card and bank payments',
      'SMS and WhatsApp alerts',
      'PDF receipts and monthly statements',
      'Audit log and role handover history',
      'Priority support in Bangla and English',
    ],
    cta: 'Book a demo',
    featured: true,
  },
] as const
