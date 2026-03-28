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
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)