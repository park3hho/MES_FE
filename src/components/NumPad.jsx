// src/components/NumPad.jsx
// ★ 숫자 키패드 오버레이 — 터치 + 키보드 입력 지원
// 호출: InspectionForm.jsx → numPad 상태가 있을 때 렌더링
// 키보드: 0~9, '.', Backspace, Enter(확인), Escape(취소)

import { useState, useEffect, useRef } from 'react'
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

  // ── 즉시 입력 핸들러 ──
  // touchstart에서 즉시 반응 → 손가락 빗겨나가도 입력됨
  // e.preventDefault()로 후속 click 이벤트 차단 (더블 입력 방지)
  // 데스크탑(마우스)에는 touchstart가 안 오니까 onClick fallback 유지
  const handlePointerAction = (action, e) => {
    if (e.type === 'touchstart') {
      e.preventDefault()  // 후속 click 이벤트 + 브라우저 기본 동작 차단
    }
    action()
  }

  // ── overlay 드래그 닫힘 방지 ──
  // 버튼에서 터치 시작 → 드래그로 overlay 영역까지 이동 → 손 떼면 overlay onClick 트리거
  // → NumPad가 닫히는 문제. touchStartedOnOverlay flag로 "overlay에서 시작된 터치만" 닫기 허용
  const touchStartedOnOverlay = useRef(false)

  // ── 스크롤 잠금 (모달 열릴 때) ──
  // position:fixed + top:-scrollY → 스크롤 위치 유지하면서 배경 스크롤 차단
  // cleanup 시 scrollTo로 원래 위치 복원 → 점프 방지
  useEffect(() => {
    const scrollY = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      window.scrollTo(0, scrollY)
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
    <div
      className={s.overlay}
      onTouchStart={() => { touchStartedOnOverlay.current = true }}
      onTouchEnd={() => { touchStartedOnOverlay.current = false }}
      onClick={(e) => {
        // 데스크탑 클릭 → 즉시 닫기
        // 모바일 터치 → overlay에서 시작된 터치만 닫기 (버튼→overlay 드래그는 무시)
        if (e.nativeEvent?.pointerType === 'touch' && !touchStartedOnOverlay.current) return
        onCancel()
      }}
    >
      <div
        className={s.sheet}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
      >
        <p className={s.label}>{label} {unit && `(${unit})`}</p>
        <p className={s.display}>{val || '0'}</p>

        <div className={s.grid}>
          {KEYS.map(ch => {
            const action = () => ch === '⌫' ? del() : tap(ch)
            return (
              <button key={ch}
                className={`${s.btn} ${ch === '⌫' ? s.btnDel : ''}`}
                onTouchStart={(e) => handlePointerAction(action, e)}
                onClick={action}>
                {ch}
              </button>
            )
          })}
        </div>

        <div className={s.confirmRow}>
          <button className={s.confirmBtn}
            onTouchStart={(e) => handlePointerAction(confirm, e)}
            onClick={confirm}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}