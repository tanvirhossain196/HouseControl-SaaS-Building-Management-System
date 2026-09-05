export const site = {
  name: 'HouseControl',
  tagline: 'Complete control over your building, from rooftop to gate.',
  description:
    'HouseControl runs the whole building: rent and dues, shared bills, the gate register, complaints and repairs — one panel for owners, flat managers and residents.',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  locale: 'en_US',
  contact: {
    email: 'mdtanvirhossain246@gmail.com',
    phone: '+880 1616-122600',
    whatsapp: '8801616122600',
    address: 'Dhaka, Bangladesh',
  },
  owner: 'Md Tanvir Hossain',
  /** Not issued yet. Replace the asterisks when it is. */
  tradeLicence: '**********',
  social: [
    { label: 'Facebook', href: 'https://www.facebook.com/md.tanvirhossain1715' },
    { label: 'Instagram', href: 'https://www.instagram.com/_tanvir._hossain_' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/mdtanvirhossain196' },
    { label: 'YouTube', href: 'https://www.youtube.com' },
  ],
  /** Where the developer credit in the footer points. */
  ownerProfile: 'https://www.facebook.com/md.tanvirhossain1715',
} as const

export const mainNav = [
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '/faq' },
  { label: 'About', href: '/about' },
] as const

export const footerNav = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', href: '/#features' },
      { label: 'How it works', href: '/#how-it-works' },
      { label: 'Pricing', href: '/pricing' },
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
