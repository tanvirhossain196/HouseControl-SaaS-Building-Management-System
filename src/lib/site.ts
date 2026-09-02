export const site = {
  name: 'HouseControl',
  tagline: 'Complete control over your building, from rooftop to gate.',
  description:
    'HouseControl runs the whole building: rent and dues, shared bills, the gate register, complaints and repairs — one panel for owners, flat managers and residents.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  locale: 'en_US',
  contact: {
    email: 'hello@housecontrol.app',
    phone: '+880 1XXX-XXXXXX',
    address: 'Gulshan-2, Dhaka 1212, Bangladesh',
  },
  social: [
    { label: 'Facebook', href: 'https://facebook.com' },
    { label: 'LinkedIn', href: 'https://linkedin.com' },
    { label: 'GitHub', href: 'https://github.com' },
  ],
} as const

export const mainNav = [
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'FAQ', href: '/faq' },
  { label: 'About', href: '/about' },
] as const

export const footerNav = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Pricing', href: '/#pricing' },
      { label: 'FAQ', href: '/faq' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'Terms & conditions', href: '/terms' },
      { label: 'Cookie policy', href: '/cookies' },
    ],
  },
] as const
