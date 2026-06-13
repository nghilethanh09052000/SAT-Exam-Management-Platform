import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1d4ed8',
        'primary-pressed': '#1e40af',
        'primary-active': '#1e3a8a',
        'on-primary': '#ffffff',
        commerce: '#d53b00',
        'commerce-pressed': '#aa2f00',
        // Navy ink family (client request: no pure black anywhere)
        ink: '#16243d',
        'ink-deep': '#101b30',
        'ink-elevated': '#1a2a47',
        charcoal: '#1e2c49',
        navy: {
          DEFAULT: '#16243d',
          deep: '#0d1830',
          soft: '#1f3156',
          tint: '#eef2f9',
        },
        'body-light': 'rgba(22,36,61,0.65)',
        'mute-light': '#5d6b85',
        'ash-light': '#c7cfdd',
        'body-dark': 'rgba(255,255,255,0.7)',
        'mute-dark': 'rgba(229,233,242,0.55)',
        'ash-dark': 'rgba(229,233,242,0.2)',
        'canvas-light': '#ffffff',
        'surface-soft': '#f1f4f9',
        'surface-card': '#f5f7fa',
        'canvas-dark': '#0d1830',
        'surface-dark-elevated': '#13213a',
        'surface-dark-card': '#182846',
        'hairline-light': '#eef1f6',
        'on-dark': '#ffffff',
        'on-dark-mute': '#c7cfdd',
        warning: '#c81b3a',
        'link-light': '#1e40af',
        'link-dark': '#7aa7ff',
      },
      fontFamily: {
        display: ['var(--font-be-vietnam)', 'Arial', 'sans-serif'],
        body: ['var(--font-be-vietnam)', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        card: '8px',
      },
      animation: {
        'fade-up':    'fadeUp 0.45s ease-out both',
        'fade-in':    'fadeIn 0.3s ease-out both',
        'pop-in':     'popIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
        'slide-left': 'slideLeft 0.35s ease-out both',
        'shimmer':    'shimmer 2s linear infinite',
        'confetti':   'confettiFall 1.4s ease-in forwards',
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        popIn: {
          '0%':   { opacity: '0', transform: 'scale(0.85)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-14px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        confettiFall: {
          '0%':   { opacity: '1', transform: 'translateY(-10px) rotate(0deg)' },
          '100%': { opacity: '0', transform: 'translateY(320px) rotate(540deg)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
