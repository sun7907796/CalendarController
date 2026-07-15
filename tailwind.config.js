export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        system: ['"Microsoft JhengHei"', '"Segoe UI"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
