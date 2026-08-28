import { resolve } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [{
    name: 'inject-service-worker-assets',
    closeBundle() {
      const html = readFileSync(resolve(__dirname, 'dist/index.html'), 'utf8')
      const paths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1])
      const swPath = resolve(__dirname, 'dist/sw.js')
      const sw = readFileSync(swPath, 'utf8').replace('/* INJECT_BUILD_ASSETS */', paths.map(path => JSON.stringify(path)).join(', '))
      writeFileSync(swPath, sw)
    },
  }],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
        terms: resolve(__dirname, 'terms/index.html'),
      },
    },
  },
})
