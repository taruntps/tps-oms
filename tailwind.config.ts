import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Arctic Precision: Manrope headlines, Inter body, JetBrains Mono labels
        display: ['Manrope', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // shadcn-style CSS variable mappings
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        // TPS Brand — Arctic Precision navy scale (remapped so existing
        // brand-* classes adopt the new theme automatically)
        brand: {
          50:  '#eef6fb',
          100: '#c8e6ff',   // primary-fixed
          200: '#b5deff',   // on-primary-container
          300: '#89ceff',   // primary-fixed-dim
          400: '#4ba6cc',
          500: '#007aa6',
          600: '#006591',   // primary-container (main action)
          700: '#004c6e',   // primary
          800: '#003c57',
          900: '#002c41',
          950: '#131b2e',   // on-surface / dark text
        },
        // Arctic Precision named tokens (for re-skinned components)
        primary:              '#004c6e',
        'primary-container':  '#006591',
        'on-primary':         '#ffffff',
        'on-primary-container':'#b5deff',
        'primary-fixed':      '#c8e6ff',
        'primary-fixed-dim':  '#89ceff',
        'success-emerald':    '#10B981',
        'warning-amber':      '#EAB308',
        'indigo-insight':     '#6366F1',
        'arctic-error':       '#ba1a1a',
        'surface-ice':        '#faf8ff',
        'surface-container':  '#eaedff',
        'on-surface':         '#131b2e',
        'on-surface-variant': '#40484e',
        'outline-soft':       '#c0c7cf',
        // Clock system colours
        clock: {
          employee: '#10B981',   // green  — employee working
          client:   '#EAB308',   // amber  — waiting on client
          authority:'#6366F1',   // indigo — waiting on FSSAI
        },
        // Status
        overdue: '#ba1a1a',
        expiry: {
          safe:  '#10B981',
          warn:  '#EAB308',
          urgent:'#ba1a1a',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.10)',
      },
      keyframes: {
        'pulse-clock': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(-8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-up': {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'pulse-clock': 'pulse-clock 2s ease-in-out infinite',
        'slide-in': 'slide-in 0.2s ease-out',
        'fade-up': 'fade-up 0.3s ease-out',
      },
    },
  },
  plugins: [animate],
}

export default config
