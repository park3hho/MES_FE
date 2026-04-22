// src/components/PrinterBadge.jsx
// 공정 페이지 상단 — 현재 선택된 프린터 표시 + 일회성 override 선택 (Phase 2, 2026-04-22)
//
// 동작:
//   - Machine.default_printer 가 기본
//   - 배지 클릭 → 드롭다운 → 다른 프린터 선택 시 sessionStorage 저장
//   - 이후 이 세션(탭)의 모든 print 요청은 override 프린터로
//   - 로그아웃/탭 닫기 → sessionStorage 초기화 → 다시 default
//
// 마운트 위치: App.jsx ProcessRoute (공정 페이지 공통 상단)

import { useState, useRef, useEffect } from 'react'
import { usePrinterSelection } from '@/hooks/usePrinterSelection'
import s from './PrinterBadge.module.css'

export default function PrinterBadge() {
  const {
    printers, activePrinter, isOverride, loading,
    defaultPrinter, setOverride, clearOverride,
  } = usePrinterSelection()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('touchstart', onDocClick)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('touchstart', onDocClick)
    }
  }, [open])

  // 프린터 목록 비어있으면 배지 숨김 (관리자가 아직 등록 전)
  if (loading) return null
  if (!printers || printers.length === 0) return null

  const label = activePrinter ? activePrinter.name : '프린터 미설정'

  return (
    <div ref={rootRef} className={s.wrap}>
      <button
        type="button"
        className={`${s.badge} ${isOverride ? s.badgeOverride : ''} ${!activePrinter ? s.badgeEmpty : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="프린터 선택"
        aria-expanded={open}
      >
        <span className={s.icon}>🖨️</span>
        <span className={s.label}>{label}</span>
        {isOverride && <span className={s.dot} title="일회성 override" />}
        <span className={s.chev}>▾</span>
      </button>

      {open && (
        <div className={s.popover} role="menu">
          <div className={s.popHeader}>이 세션에서 사용할 프린터</div>

          {printers.map((p) => {
            const isActive = activePrinter?.id === p.id
            const isDefault = defaultPrinter?.id === p.id
            return (
              <button
                key={p.id}
                type="button"
                className={`${s.opt} ${isActive ? s.optActive : ''}`}
                onClick={() => {
                  // default 와 같은 프린터를 고르면 override 해제 (default 유지)
                  if (p.id === defaultPrinter?.id) clearOverride()
                  else setOverride(p.id)
                  setOpen(false)
                }}
              >
                <span className={s.optMain}>
                  <strong>{p.name}</strong>
                  <span className={s.optIp}>{p.ip}</span>
                </span>
                <span className={s.optFlags}>
                  {isDefault && <span className={s.tagDefault}>기본</span>}
                  {isActive && <span className={s.tagActive}>선택됨</span>}
                </span>
              </button>
            )
          })}

          {isOverride && (
            <button
              type="button"
              className={s.resetBtn}
              onClick={() => { clearOverride(); setOpen(false) }}
            >
              기본 프린터로 복원
            </button>
          )}
        </div>
      )}
    </div>
  )
}
