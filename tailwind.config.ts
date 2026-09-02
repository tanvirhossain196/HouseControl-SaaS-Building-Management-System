import type { Config } from 'tailwindcss'

const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1.25rem', lg: '2rem' },
      screens: { '2xl': '1200px' },
    },
    extend: {
      colors: {
        paper: rgb('--paper'),
        surface: rgb('--surface'),
        raised: rgb('--raised'),
        ink: rgb('--ink'),
        muted: rgb('--muted'),
        line: rgb('--line'),
        primary: { DEFAULT: rgb('--primary'), fg: rgb('--primary-fg'), soft: rgb('--primary-soft') },
        accent: { DEFAULT: rgb('--accent'), fg: rgb('--accent-fg'), soft: rgb('--accent-soft') },
        paid: { DEFAULT: rgb('--paid'), soft: rgb('--paid-soft') },
        due: { DEFAULT: rgb('--due'), soft: rgb('--due-soft') },
        overdue: { DEFAULT: rgb('--overdue'), soft: rgb('--overdue-soft') },
        vacant: rgb('--vacant'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // 1.25 modular scale, tuned for a dense operations product
        'display-lg': ['clamp(2.6rem, 1.4rem + 3.4vw, 4.25rem)', { lineHeight: '1.02', letterSpacing: '-0.033em', fontWeight: '650' }],
        display: ['clamp(2rem, 1.3rem + 2.2vw, 3rem)', { lineHeight: '1.08', letterSpacing: '-0.028em', fontWeight: '650' }],
        title: ['clamp(1.35rem, 1.1rem + 0.8vw, 1.75rem)', { lineHeight: '1.2', letterSpacing: '-0.018em', fontWeight: '600' }],
        lead: ['1.0625rem', { lineHeight: '1.65' }],
      },
      borderRadius: {
        tile: '5px',
        control: '9px',
        panel: '14px',
        sheet: '20px',
      },
      spacing: {
        // 8px grid helpers
        18: '4.5rem',
        26: '6.5rem',
        34: '8.5rem',
      },
      boxShadow: {
        panel: '0 1px 2px rgb(var(--shadow) / 0.05), 0 12px 32px -18px rgb(var(--shadow) / 0.28)',
        lift: '0 2px 4px rgb(var(--shadow) / 0.06), 0 22px 48px -24px rgb(var(--shadow) / 0.38)',
        inset: 'inset 0 1px 0 rgb(255 255 255 / 0.06)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'meter-fill': { from: { transform: 'scaleX(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'scale-in': 'scale-in 160ms cubic-bezier(0.2, 0.8, 0.3, 1)',
        'slide-in-right': 'slide-in-right 200ms cubic-bezier(0.2, 0.8, 0.3, 1)',
        shimmer: 'shimmer 1.6s infinite',
        'meter-fill': 'meter-fill 900ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}

export default config
