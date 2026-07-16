import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  // 以相對路徑輸出資源，Electron 以 file:// 載入才找得到 assets（否則畫面全白）
  base: './',
  plugins: [vue()],
  css: {
    postcss: './postcss.config.js'
  },
  server: {
    port: 5173
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer')
    }
  }
})
