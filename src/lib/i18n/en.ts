/**
 * English strings.
 *
 * This file is the shape: `bn.ts` is typed as `typeof en`, so a missing key
 * fails the build rather than showing an English word inside a Bangla
 * sentence. That is the whole reason the dictionary is a plain object and not
 * a JSON file loaded at runtime.
 *
 * Keys are grouped by where they appear, not by what they mean. When a
 * sentence moves, its key moves with it.
 */
export const en = {
  common: {
    signIn: 'Sign in',
    signUp: 'Get started',
    signOut: 'Sign out',
    dashboard: 'Dashboard',
    backToSite: 'Back to site',
    language: 'Language',
    email: 'Email',
    password: 'Password',
    yourName: 'Your name',
    loading: 'Loading',
    save: 'Save changes',
    cancel: 'Cancel',
    search: 'Search',
  },

  nav: {
    features: 'Features',
    howItWorks: 'How it works',
    pricing: 'Pricing',
    faq: 'FAQ',
    about: 'About',
    contact: 'Contact',
  },

  hero: {
    title: 'Every flat, every taka, every visitor at the gate.',
    body: 'HouseControl is the panel your building runs on. Rent and dues, shared bills, repairs and the gate register live in one place, with a separate view for the owner, each flat moderator, every resident and the guard.',
    primary: 'Set up your building',
    secondary: 'See how it works',
    note: 'Free for one building up to 12 units. No card needed to start.',
  },

  panel: {
    collectedIn: 'collected in September',
    of: 'of',
    atTheGate: 'At the gate today',
    monthlyRent: 'Monthly rent',
    residents: 'Residents',
    rentDay: 'Rent day',
    rentPaid: 'Rent paid',
    paymentDue: 'Payment due',
    overdue: 'Overdue',
    vacant: 'Vacant',
    flat: 'Flat',
  },

  features: {
    heading: 'One building, six things to keep track of',
    intro:
      'Most owners run all of it on a register, a calculator and a WhatsApp group. HouseControl keeps the same work, minus the chasing.',
  },

  steps: {
    heading: 'Three steps to a building that runs itself',
    intro: 'Set it up once. After that the month repeats on its own.',
    step: 'Step',
  },

  pricing: {
    heading: 'Priced per building, not per person',
    payFor: 'Pay for',
    perMonth: 'per month',
    forever: 'forever',
    billedMonthly: 'billed monthly',
    save: 'save',
    yourPlan: 'Your plan',
    popular: 'Most buildings pick this',
    startFree: 'Start free',
    getOnWhatsApp: 'on WhatsApp',
    paymentNote:
      'Payment is arranged over WhatsApp — bKash, Nagad, bank transfer or card. Send the message and the details come back within the hour on a working day.',
    urgentNote: 'Something urgent, or a building that has to be running today? Call',
    insteadOfWaiting: 'instead of waiting for a reply.',
  },

  faq: {
    heading: 'Questions owners ask first',
    intro: 'If yours is not here, the full list is on the FAQ page.',
  },

  cta: {
    heading: 'Put your building on one screen.',
    body: 'Add your flats, invite your residents, and let this month collect itself.',
    primary: 'Set up your building',
    secondary: 'Talk to us first',
  },

  footer: {
    tagline: 'Complete control over your building, from rooftop to gate.',
    tradeLicence: 'Trade licence',
    developedBy: 'Developed by',
    privacy: 'Privacy',
    terms: 'Terms',
    cookies: 'Cookies',
    support: 'Support',
    product: 'Product',
    company: 'Company',
    legal: 'Legal',
  },

  auth: {
    signInTitle: 'Sign in',
    signInSubtitle: 'Your building, your dues, your gate log.',
    signUpTitle: 'Create your account',
    signUpSubtitle: 'Free for one building up to 12 units. No card needed.',
    continueWithGoogle: 'Continue with Google',
    orUseEmail: 'or use email',
    passwordTab: 'Password',
    linkTab: 'Email link',
    emailMeALink: 'Email me a sign-in link',
    forgotPassword: 'Forgot your password?',
    noAccount: 'New here?',
    createAccount: 'Create an account',
    haveAccount: 'Already have an account?',
    confirmPassword: 'Confirm password',
    passwordHint: 'At least 10 characters, with upper and lower case and a number.',
    verifyNotice:
      'We send a verification link before the account can be used. Unverified accounts cannot see any building.',
    linkNotice:
      'We send a link that signs you in for 30 days on this device. No password to remember.',
  },

  dashboard: {
    welcome: 'Welcome back',
    hello: 'Hello',
    noBuilding: 'No building yet',
    noBuildingBody:
      'An owner or a flat moderator invites you by email. Open the invite link and this dashboard fills up with your flat, your dues and your gate log.',
    setUpBuilding: 'I am the owner — set up my building',
    outstanding: 'Outstanding this month',
    youOwe: 'You owe',
    overdue: 'Overdue',
    toConfirm: 'Payments to confirm',
    openRepairs: 'Open repairs',
    buildings: 'Buildings',
    units: 'Units',
    residents: 'Residents',
    collected: 'Collected this month',
  },
}

/**
 * No `as const` above: with it, every value's type is the English string
 * itself, and Bangla fails to assign because "সাইন ইন" is not "Sign in".
 * Widening to `string` is what makes this a shape other languages can fill.
 */
export type Dictionary = typeof en
