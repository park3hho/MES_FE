// src/components/NumPad.jsx
// ★ 숫자 키패드 오버레이 — 터치 + 키보드 입력 지원
// 호출: InspectionForm.jsx → numPad 상태가 있을 때 렌더링
// 키보드: 0~9, '.', Backspace, Enter(확인), Escape(취소)

import { useState, useEffect } from 'react'
import s from './NumPad.module.css'

// 키패드 버튼 배열 (3×4 그리드)
const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫']

export default function NumPad({ label, unit, onConfirm, onCancel }) {
  const [val, setVal] = useState('')

  // ── 터치/클릭 입력 ──
  const tap = (ch) => {
    if (ch === '.' && val.includes('.')) return
    // 소수점 3자리 초과 차단
    const dotIdx = val.indexOf('.')
    if (dotIdx !== -1 && ch !== '.' && val.length - dotIdx > 3) return
    setVal(v => v + ch)
  }

  const del = () => setVal(v => v.slice(0, -1))

  const confirm = () => {
    if (!val) return
    onConfirm(val)
    setVal('')
  }

  // ── 스크롤 잠금 (모달 열릴 때) ──
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.width = '100%'
    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
    }
  }, [])

  // ── 키보드 입력 지원 ──
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key >= '0' && e.key <= '9') tap(e.key)
      else if (e.key === '.') tap('.')
      else if (e.key === 'Backspace') del()
      else if (e.key === 'Enter') confirm()
      else if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [val])

  return (
    <div className={s.overlay} onClick={onCancel}>
      <div className={s.sheet} onClick={e => e.stopPropagation()}>
        <p className={s.label}>{label} {unit && `(${unit})`}</p>
        <p className={s.display}>{val || '0'}</p>

        <div className={s.grid}>
          {KEYS.map(ch => (
            <button key={ch}
              className={`${s.btn} ${ch === '⌫' ? s.btnDel : ''}`}
              onClick={() => ch === '⌫' ? del() : tap(ch)}>
              {ch}
            </button>
          ))}
        </div>

        <div className={s.confirmRow}>
          <button className={s.confirmBtn} onClick={confirm}>확인</button>
        </div>
      </div>
    </div>
  )
}