import type { Dictionary } from './en'

/**
 * Bangla strings.
 *
 * Typed as `Dictionary`, so a key missing here fails `tsc` rather than
 * appearing as an English word inside a Bangla sentence.
 *
 * Written as a Dhaka building owner would say it, not translated word by
 * word. Some things stay in English on purpose: বিকাশ and নগদ are brand
 * names, and unit numbers, amounts and dates are read in English digits by
 * everyone who keeps a rent register.
 */
export const bn: Dictionary = {
  common: {
    signIn: 'সাইন ইন',
    signUp: 'শুরু করুন',
    signOut: 'সাইন আউট',
    dashboard: 'ড্যাশবোর্ড',
    backToSite: 'সাইটে ফিরে যান',
    language: 'ভাষা',
    email: 'ইমেইল',
    password: 'পাসওয়ার্ড',
    yourName: 'আপনার নাম',
    loading: 'লোড হচ্ছে',
    save: 'সেভ করুন',
    cancel: 'বাতিল',
    search: 'খুঁজুন',
  },

  nav: {
    features: 'ফিচার',
    howItWorks: 'কীভাবে কাজ করে',
    pricing: 'মূল্য',
    faq: 'সাধারণ প্রশ্ন',
    about: 'পরিচিতি',
    contact: 'যোগাযোগ',
  },

  hero: {
    title: 'প্রতিটি ফ্ল্যাট, প্রতিটি টাকা, গেটের প্রতিটি অতিথি।',
    body: 'HouseControl আপনার বিল্ডিং চালানোর প্যানেল। ভাড়া ও বকেয়া, শেয়ার্ড বিল, মেরামত আর গেট রেজিস্টার — সব এক জায়গায়। মালিক, ফ্ল্যাট মডারেটর, ভাড়াটিয়া আর দারোয়ান — প্রত্যেকের আলাদা স্ক্রিন।',
    primary: 'বিল্ডিং সেট আপ করুন',
    secondary: 'কীভাবে কাজ করে দেখুন',
    note: 'একটি বিল্ডিং, ৪টি ইউনিট পর্যন্ত ফ্রি। শুরু করতে কার্ড লাগবে না।',
  },

  panel: {
    collectedIn: 'সেপ্টেম্বরে আদায়',
    of: 'এর মধ্যে',
    atTheGate: 'আজ গেটে',
    monthlyRent: 'মাসিক ভাড়া',
    residents: 'ভাড়াটিয়া',
    rentDay: 'ভাড়ার দিন',
    rentPaid: 'ভাড়া পরিশোধিত',
    paymentDue: 'পেমেন্ট বাকি',
    overdue: 'মেয়াদ পেরিয়েছে',
    vacant: 'খালি',
    flat: 'ফ্ল্যাট',
  },

  features: {
    heading: 'একটি বিল্ডিং, ছয়টি জিনিসের হিসাব',
    intro:
      'বেশিরভাগ মালিক এসব চালান খাতা, ক্যালকুলেটর আর একটা হোয়াটসঅ্যাপ গ্রুপ দিয়ে। HouseControl একই কাজ রাখে — শুধু পেছনে ঘোরাঘুরিটা বাদ দিয়ে।',
  },

  steps: {
    heading: 'তিন ধাপে বিল্ডিং নিজেই চলবে',
    intro: 'একবার সেট করুন। এরপর প্রতি মাস নিজে থেকেই চলতে থাকবে।',
    step: 'ধাপ',
  },

  pricing: {
    heading: 'দাম বিল্ডিং হিসেবে, মানুষ হিসেবে নয়',
    payFor: 'যত সময়ের জন্য',
    perMonth: 'প্রতি মাসে',
    forever: 'সবসময় ফ্রি',
    billedMonthly: 'মাসে মাসে বিল',
    save: 'সাশ্রয়',
    yourPlan: 'আপনার প্ল্যান',
    popular: 'বেশিরভাগ বিল্ডিং এটাই নেয়',
    startFree: 'ফ্রি শুরু করুন',
    getOnWhatsApp: 'নিন হোয়াটসঅ্যাপে',
    paymentNote:
      'পেমেন্ট হোয়াটসঅ্যাপে ঠিক করা হয় — বিকাশ, নগদ, ব্যাংক ট্রান্সফার বা কার্ড। মেসেজ পাঠান, কর্মদিবসে এক ঘণ্টার মধ্যেই বিস্তারিত পাবেন।',
    urgentNote:
      'জরুরি কিছু, বা আজই বিল্ডিং চালু করতে হবে? উত্তরের অপেক্ষা না করে কল করুন',
    insteadOfWaiting: '—',
  },

  faq: {
    heading: 'মালিকেরা প্রথমেই যা জিজ্ঞেস করেন',
    intro: 'আপনারটা এখানে না থাকলে পুরো তালিকা FAQ পাতায় আছে।',
  },

  cta: {
    heading: 'পুরো বিল্ডিং এক স্ক্রিনে আনুন।',
    body: 'ফ্ল্যাট যোগ করুন, ভাড়াটিয়াদের আমন্ত্রণ পাঠান — এই মাসের ভাড়া নিজেই উঠতে থাকবে।',
    primary: 'বিল্ডিং সেট আপ করুন',
    secondary: 'আগে কথা বলি',
  },

  footer: {
    tagline: 'ছাদ থেকে গেট পর্যন্ত, পুরো বিল্ডিং আপনার নিয়ন্ত্রণে।',
    tradeLicence: 'ট্রেড লাইসেন্স',
    developedBy: 'ডেভেলপ করেছেন',
    privacy: 'গোপনীয়তা',
    terms: 'শর্তাবলী',
    cookies: 'কুকি',
    support: 'সাপোর্ট',
    product: 'প্রোডাক্ট',
    company: 'প্রতিষ্ঠান',
    legal: 'আইনি তথ্য',
  },

  auth: {
    signInTitle: 'সাইন ইন',
    signInSubtitle: 'আপনার বিল্ডিং, আপনার বকেয়া, আপনার গেট লগ।',
    signUpTitle: 'অ্যাকাউন্ট খুলুন',
    signUpSubtitle: 'একটি বিল্ডিং, ৪টি ইউনিট পর্যন্ত ফ্রি। কার্ড লাগবে না।',
    continueWithGoogle: 'Google দিয়ে চালিয়ে যান',
    orUseEmail: 'অথবা ইমেইল দিয়ে',
    passwordTab: 'পাসওয়ার্ড',
    linkTab: 'ইমেইল লিংক',
    emailMeALink: 'ইমেইলে সাইন-ইন লিংক পাঠান',
    forgotPassword: 'পাসওয়ার্ড ভুলে গেছেন?',
    noAccount: 'নতুন এসেছেন?',
    createAccount: 'অ্যাকাউন্ট খুলুন',
    haveAccount: 'অ্যাকাউন্ট আছে?',
    confirmPassword: 'পাসওয়ার্ড আবার লিখুন',
    passwordHint: 'কমপক্ষে ১০ অক্ষর, বড় ও ছোট হাতের অক্ষর এবং একটি সংখ্যা সহ।',
    verifyNotice:
      'অ্যাকাউন্ট ব্যবহারের আগে আমরা একটি ভেরিফিকেশন লিংক পাঠাই। ভেরিফাই না করা অ্যাকাউন্ট কোনো বিল্ডিং দেখতে পায় না।',
    linkNotice:
      'আমরা এমন একটি লিংক পাঠাই যা এই ডিভাইসে ৩০ দিন সাইন ইন রাখে। পাসওয়ার্ড মনে রাখার দরকার নেই।',
  },

  dashboard: {
    welcome: 'আবার স্বাগতম',
    hello: 'হ্যালো',
    noBuilding: 'এখনো কোনো বিল্ডিং নেই',
    noBuildingBody:
      'মালিক বা ফ্ল্যাট মডারেটর আপনাকে ইমেইলে আমন্ত্রণ পাঠাবেন। লিংকটি খুললেই এই ড্যাশবোর্ডে আপনার ফ্ল্যাট, বকেয়া আর গেট লগ চলে আসবে।',
    setUpBuilding: 'আমিই মালিক — আমার বিল্ডিং সেট আপ করি',
    outstanding: 'এ মাসে বাকি',
    youOwe: 'আপনার বাকি',
    overdue: 'মেয়াদোত্তীর্ণ',
    toConfirm: 'নিশ্চিত করার পেমেন্ট',
    openRepairs: 'চলমান মেরামত',
    buildings: 'বিল্ডিং',
    units: 'ইউনিট',
    residents: 'ভাড়াটিয়া',
    collected: 'এ মাসে আদায়',
  },
}