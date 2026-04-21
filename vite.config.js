import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'

// 빌드/dev 시작 시점을 버전으로 자동 주입 (YY.MM.DD.HHMM — KST)
const _now = new Date(Date.now() + 9 * 60 * 60 * 1000) // UTC → KST
const pad = (n) => String(n).padStart(2, '0')
const APP_VERSION = `v${String(_now.getUTCFullYear()).slice(2)}.${pad(
  _now.getUTCMonth() + 1,
)}.${pad(_now.getUTCDate())}.${pad(_now.getUTCHours())}${pad(_now.getUTCMinutes())}`
const BUILD_TIME = _now.toISOString()

// 빌드 시점에 public/version.json 자동 생성 — 클라이언트 폴링으로 업데이트 감지
// dist/version.json 는 정적 파일로 배포돼서 HTTP GET으로 접근 가능
function generateVersionFile() {
  return {
    name: 'generate-version-file',
    buildStart() {
      const dir = path.resolve(__dirname, 'public')
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        path.join(dir, 'version.json'),
        JSON.stringify({ version: APP_VERSION, buildTime: BUILD_TIME }, null, 2),
      )
    },
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  plugins: [
    generateVersionFile(),
    react(),
    VitePWA({
      // ← 여기만 추가
      registerType: 'autoUpdate',
      manifest: {
        name: 'Faraday MES',
        short_name: 'FD MES',
        theme_color: '#1a2f6e',
        background_color: '#ffffff',
        display: 'standalone',
        display_override: ['window-controls-overlay'],
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' }, // any 제거
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        skipWaiting: true, // ← 추가
        clientsClaim: true, // ← 추가
        runtimeCaching: [
          {
            urlPattern: /\/api\//, // API는 캐시 안 함
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
