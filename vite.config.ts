import { defineConfig } from 'vite'

export default defineConfig({
  // Relative assets keep the build portable between GitHub Pages project
  // paths, the arcade iframe and a local preview.
  base: './',
  server: { port: 5177 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
})
