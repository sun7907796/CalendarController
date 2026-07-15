const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, '..', 'dist')
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true })
}

// Build main.ts and preload.ts
esbuild.buildSync({
  entryPoints: [
    path.join(__dirname, '..', 'src', 'main.ts'),
    path.join(__dirname, '..', 'src', 'preload.ts')
  ],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outdir: distDir,
  outbase: path.join(__dirname, '..', 'src'),
  format: 'cjs',
  external: ['electron', 'googleapis']
})

console.log('✅ Main process compiled')
