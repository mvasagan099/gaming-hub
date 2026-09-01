/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        hub: {
          dark: '#0f172a',
          card: '#1e293b',
          accent: '#6366f1',
          gold: '#f59e0b',
        }
      }
    },
  },
  plugins: [],
}
