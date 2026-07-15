import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  plugins: [vue()],
  css: {
    postcss: './postcss.config.js'
  },
  server: {
    port: 5173
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    sourcemap: false,
    minify: 'esbuild'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer')
    }
  }
})
