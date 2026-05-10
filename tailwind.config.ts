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
        primary: '#0070d1',
        'primary-pressed': '#0064b7',
        'primary-active': '#004d8d',
        'on-primary': '#ffffff',
        commerce: '#d53b00',
        'commerce-pressed': '#aa2f00',
        ink: '#000000',
        'ink-deep': '#121314',
        'ink-elevated': '#181818',
        charcoal: '#1f2024',
        'body-light': 'rgba(0,0,0,0.6)',
        'mute-light': '#6b6b6b',
        'ash-light': '#cccccc',
        'body-dark': 'rgba(255,255,255,0.7)',
        'mute-dark': 'rgba(229,229,229,0.55)',
        'ash-dark': 'rgba(229,229,229,0.2)',
        'canvas-light': '#ffffff',
        'surface-soft': '#f3f3f3',
        'surface-card': '#f5f7fa',
        'canvas-dark': '#000000',
        'surface-dark-elevated': '#121314',
        'surface-dark-card': '#181818',
        'hairline-light': '#f3f3f3',
        'on-dark': '#ffffff',
        'on-dark-mute': '#cccccc',
        warning: '#c81b3a',
        'link-light': '#0064b7',
        'link-dark': '#53b1ff',
      },
      fontFamily: {
        display: ['Roboto', 'Arial', 'sans-serif'],
        body: ['Inter', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        card: '8px',
      },
    },
  },
  plugins: [],
};
export default config;
