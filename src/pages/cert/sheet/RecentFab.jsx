// pages/cert/sheet/RecentFab.jsx
// 최근 본 UB 박스 5개 — 우하단 floating 버튼 (CertFlow 분할, 2026-05-08).
// localStorage 'cert_recent_ubs' = [{ mb, ub, phi, st_count, at }, ...] FIFO 5
// 클릭 시 popup → 항목 클릭 시 /{mb}/{ub} 로 navigate

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import s from '../CertFlow.module.css'

export default function RecentFab({ currentToken }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])

  // 항상 최신 list 유지 — popup 열린 상태에서 다른 박스 진입해도 즉시 반영 (2026-04-29)
  //   1) mount 시 1회 로드
  //   2) 같은 탭 내 변경: UBBlock 의 'cert_recent_updated' custom event
  //   3) 다른 탭 변경: 'storage' event
  useEffect(() => {
    const refresh = (e) => {
      try {
        const next = e?.detail || JSON.parse(localStorage.getItem('cert_recent_ubs') || '[]')
        setItems(Array.isArray(next) ? next : [])
      } catch {
        setItems([])
      }
    }
    refresh()
    window.addEventListener('cert_recent_updated', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('cert_recent_updated', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  // 같은 MB 안 UB 만 표시 — 다른 MB 박스 history 노출 방지 (2026-04-29)
  // currentToken 미전달 시 (예외) 전체 표시 fallback
  const visibleItems = currentToken ? items.filter((it) => it.mb === currentToken) : items

  const handleSelect = (it) => {
    setOpen(false)
    const search = window.location.search || ''
    navigate(`/${it.mb}/${encodeURIComponent(it.ub)}${search}`)
  }

  return (
    <>
      <button
        type="button"
        className={s.recentFab}
        onClick={() => setOpen((o) => !o)}
        aria-label="Recent boxes"
        title="Recent boxes"
      >
        {/* 미니멀 history 아이콘 (얇은 stroke) */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 1 0 2.6-6.36" />
          <polyline points="3 3 3 8 8 8" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={s.recentPopup}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={s.recentTitle}>Recent boxes</div>
            {visibleItems.length === 0 ? (
              <div className={s.recentEmpty}>No history yet.</div>
            ) : (
              <AnimatePresence initial={false}>
                {visibleItems.map((it) => (
                  <motion.button
                    key={`${it.mb}:${it.ub}`}
                    layout
                    type="button"
                    className={s.recentItem}
                    onClick={() => handleSelect(it)}
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className={s.recentItemTop}>{it.ub}</div>
                    <div className={s.recentItemSub}>
                      {it.phi ? `Φ${it.phi} · ` : ''}ST {it.st_count}
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
