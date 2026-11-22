import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

function demoBuildMetadata(): Plugin {
  let apiBaseUrl = ''
  return {
    name: 'isemotalk-demo-build-metadata',
    configResolved(config) {
      // Match the effective origin in src/api/isemotalk.ts, including DEV builds
      // and trailing-slash normalization. Read Vite's final env, not the shell.
      const requested = config.env.VITE_API_BASE_URL ?? (config.env.DEV ? 'http://127.0.0.1:3001' : '')
      apiBaseUrl = requested.endsWith('/') ? requested.slice(0, -1) : requested
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'demo-build.json', source: JSON.stringify({ version: 1, apiBaseUrl }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), demoBuildMetadata()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true } },
  },
})
