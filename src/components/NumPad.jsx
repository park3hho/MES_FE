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
    const submitted = val
    setVal('')
    // unmount 지연 — ghost click이 NumPad 뒤 요소로 전달되는 것 방지
    // (pointerdown에서 즉시 onConfirm 호출 시 부모가 즉시 언마운트 → 브라우저의
    //  touchend 좌표 위 합성 click이 QR 스캔 영역 등 뒤쪽 요소에 도달)
    setTimeout(() => onConfirm(submitted), 0)
  }

  // ── 즉시 입력 핸들러 (pointerdown 단독) ──
  // pointerdown = 손가락/펜/마우스 "눌리는 순간" 발화 (touchstart + mousedown 통합)
  // → 첫 터치에 즉시 입력. 손가락 떼는 것 기다리지 않음
  // e.preventDefault() → 포커스 이동 방지 + click 합성 힌트
  const handlePointer = (action, e) => {
    e.preventDefault()
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
                type="button"
                className={`${s.btn} ${ch === '⌫' ? s.btnDel : ''}`}
                onPointerDown={(e) => handlePointer(action, e)}>
                {ch}
              </button>
            )
          })}
        </div>

        <div className={s.confirmRow}>
          <button className={s.confirmBtn}
            type="button"
            onPointerDown={(e) => handlePointer(confirm, e)}>
            확인
          </button>
        </div>
      </div>
    </div>
  )
}