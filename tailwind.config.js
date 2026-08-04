/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          navy: 'var(--brand-primary)',
          'navy-light': 'var(--brand-primary-light)',
          'navy-muted': 'var(--brand-primary-muted)',
          gold: 'var(--brand-accent)',
          'gold-light': 'var(--brand-accent-light)',
          'gold-dark': 'var(--brand-accent-dark)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-in': 'slideIn 0.25s ease-out',
        'pulse-gold': 'pulseGold 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: {
          '0%': { transform: 'translateX(-16px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        pulseGold: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      boxShadow: {
        card: '0 2px 12px 0 rgba(15,32,64,0.08)',
        'card-hover': '0 6px 24px 0 rgba(15,32,64,0.15)',
      },
    },
  },
  plugins: [],
}
