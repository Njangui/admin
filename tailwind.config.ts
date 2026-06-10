import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { 50:'#fff7f4', 500:'#f95d1e', 600:'#e84e0f', 700:'#c43d08' },
        hb: { 50:'#f7f7f7', 100:'#ebebeb', 200:'#dddddd', 300:'#b0b0b0', 400:'#717171', 500:'#484848', 600:'#383838', 700:'#222222', 800:'#1a1a1a' },
      },
      fontFamily: { sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'] },
      borderRadius: { xl:'12px', '2xl':'16px', '3xl':'24px' },
      animation: {
        'fade-in': 'fadeIn .2s ease-out',
        'slide-up': 'slideUp .25s ease-out',
        'shimmer': 'shimmer 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from:{opacity:'0'}, to:{opacity:'1'} },
        slideUp: { from:{opacity:'0',transform:'translateY(8px)'}, to:{opacity:'1',transform:'translateY(0)'} },
        shimmer: { '0%':{backgroundPosition:'-200% 0'}, '100%':{backgroundPosition:'200% 0'} },
      },
    },
  },
  plugins: [],
}
export default config
