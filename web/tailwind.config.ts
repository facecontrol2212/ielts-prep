import type { Config } from 'tailwindcss'

/**
 * Design tokens live as CSS variables in src/styles/globals.css so that the exam runner
 * can re-theme itself (high contrast, larger text) without a rebuild.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          fg: 'rgb(var(--primary-fg) / <alpha-value>)',
          soft: 'rgb(var(--primary-soft) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          fg: 'rgb(var(--accent-fg) / <alpha-value>)',
        },
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        // exam-runner specific
        exam: {
          bar: 'rgb(var(--exam-bar) / <alpha-value>)',
          paper: 'rgb(var(--exam-paper) / <alpha-value>)',
          answered: 'rgb(var(--exam-answered) / <alpha-value>)',
          flagged: 'rgb(var(--exam-flagged) / <alpha-value>)',
          current: 'rgb(var(--exam-current) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // the reading passage scales independently of the chrome
        passage: ['var(--passage-size)', { lineHeight: 'var(--passage-leading)' }],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem' },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 4px 16px rgb(15 23 42 / 0.06)',
        pop: '0 8px 32px rgb(15 23 42 / 0.12)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--danger) / 0.5)' },
          '70%': { boxShadow: '0 0 0 8px rgb(var(--danger) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--danger) / 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'pulse-ring': 'pulse-ring 1.4s ease-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
