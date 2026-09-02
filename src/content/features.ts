import type { LucideIcon } from 'lucide-react'
import {
  BellRing,
  ClipboardList,
  CreditCard,
  ReceiptText,
  ShieldCheck,
  Users,
} from 'lucide-react'

export type Feature = {
  title: string
  body: string
  icon: LucideIcon
  points?: string[]
}

/** The one feature that gets the wide slot — it is why owners sign up. */
export const primaryFeature: Feature = {
  title: 'Rent and dues, settled every month',
  body: 'Set what each flat owes, split it between residents, and let the ledger do the counting. Payments land as pending until a moderator confirms them, and every confirmed payment produces a receipt.',
  icon: CreditCard,
  points: [
    'Split one flat’s rent across several residents',
    'Unpaid balances carry forward automatically',
    'bKash, card and bank transfer, verified server-side',
  ],
}

export const features: Feature[] = [
  {
    title: 'Gate register',
    body: 'The guard logs who comes in. Residents pre-approve guests and get a notification the moment they arrive.',
    icon: ShieldCheck,
  },
  {
    title: 'Repairs and complaints',
    body: 'A leaking tap goes from open to resolved with photos, an owner, and a timestamp on every step.',
    icon: ClipboardList,
  },
  {
    title: 'Shared bills',
    body: 'Electricity, gas, water, lift and security, split across flats and folded into the same dues.',
    icon: ReceiptText,
  },
  {
    title: 'Four kinds of access',
    body: 'Owner, flat moderator, resident and guard each see their own screen. Handover of a moderator role needs consent from both sides.',
    icon: Users,
  },
  {
    title: 'Reminders that get read',
    body: 'Due in three days, due today, overdue — in the app, by email, by SMS for the ones that matter.',
    icon: BellRing,
  },
]

export const steps = [
  {
    title: 'Add the building',
    body: 'Floors, units, rent per unit and the day rent is due. Ten minutes for a six-storey walk-up.',
  },
  {
    title: 'Invite people',
    body: 'A moderator per flat, residents by email or phone. Everyone verifies before they can see anything.',
  },
  {
    title: 'Run the month',
    body: 'Reminders go out on their own. Payments come in, get confirmed, and the dues board clears itself.',
  },
]
