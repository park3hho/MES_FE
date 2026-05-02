// 전역 스타일 — 순서 중요 (variables → base → layout → buttons → forms → process)
import '@/styles/variables.css'
import '@/styles/base.css'
import '@/styles/layout.css'
import '@/styles/buttons.css'
import '@/styles/forms.css'
import '@/styles/process.css'

// 앱 진입점
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'

// ════════════════════════════════════════════════════════════
// Service Worker 조건부 등록 (2026-05-02)
//   · lot.*  : PWA 정상 등록 — 작업자 홈 화면 설치 / 오프라인 fallback / 푸시
//   · cert.* : SW 미등록 — 외부 고객 페이지, 일반 웹사이트처럼 매 방문 신선하게.
//              과거에 등록된 SW / 캐시는 즉시 정리 (구버전 캐시 잔존 차단).
// ════════════════════════════════════════════════════════════
if (typeof window !== 'undefined') {
  const isCertDomain = window.location.hostname.startsWith('cert.')
  if (isCertDomain) {
    // cert.* — 기존 SW 등록 흔적 정리 (이전 배포에서 SW 캐싱했던 사용자 대응)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => { /* 차단 환경 — 무시 */ })
    }
    if ('caches' in window) {
      caches.keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => { /* */ })
    }
  } else {
    // lot.* — PWA 정상 SW 등록 (vite-plugin-pwa virtual module)
    import('virtual:pwa-register')
      .then(({ registerSW }) => registerSW({ immediate: true }))
      .catch(() => { /* dev 환경 등 PWA 비활성 — 무시 */ })
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)