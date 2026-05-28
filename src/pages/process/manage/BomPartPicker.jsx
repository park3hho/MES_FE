// BomPartPicker — BOM 편집의 품목 선택 dropdown (2026-05-27 신규, 2026-05-28 portal)
//   table cell 안에서 native <select> 가 풀 정보 표시할 수 없는 문제 해결.
//   카드형 항목 + 실시간 검색 + 바깥클릭/ESC 닫기.
//
// Portal 사용 (2026-05-28): table td 의 overflow / 좁은 너비에 dropdown 이 잘리던 문제 해결.
//   dropdown 만 document.body 로 portal + position:fixed. trigger 위치는 ref 로 추적.
//
// 사용:
//   <BomPartPicker
//     value={h.parent_part_id}
//     onChange={(id) => set('parent_part_id', id)}
//     parts={allParts}
//     catById={catById}
//     catParentOf={catParentOf}
//     disabled={!isNew}
//   />
import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { composeFullCode } from '@/utils/categoryTree'
import s from './BomPartPicker.module.css'

const DROPDOWN_MIN_WIDTH = 360   // 풀 식별코드 + 품목명 + 규격 한 줄에 들어가게

export default function BomPartPicker({
  value,
  onChange,
  parts = [],
  catById = {},
  catParentOf = {},
  placeholder = '(선택)',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState(null)   // dropdown fixed 좌표 {top, left, width}
  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)
  const searchRef = useRef(null)

  const selected = useMemo(
    () => parts.find((p) => String(p.id) === String(value)) || null,
    [parts, value],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return parts
    return parts.filter((p) => {
      const code = (composeFullCode(p, catById, catParentOf) || '').toLowerCase()
      const name = (p.name || '').toLowerCase()
      const spec = (p.spec || '').toLowerCase()
      const raw = (p.part_no || '').toLowerCase()
      return code.includes(q) || name.includes(q) || spec.includes(q) || raw.includes(q)
    })
  }, [parts, search, catById, catParentOf])

  const close = () => {
    setOpen(false)
    setSearch('')
    setPos(null)
  }
  const pick = (p) => {
    onChange(p.id)
    close()
  }

  // 열림 시: trigger 좌표 계산(fixed 좌표) · 자동 포커스 · 닫기 핸들러 부착.
  //   table 안 td 의 overflow 영향을 받지 않도록 dropdown 은 portal 로 body 에 렌더,
  //   trigger 위치를 fixed 좌표로 따라가게 함.
  useEffect(() => {
    if (!open) return
    const calcPos = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setPos({
        top: r.bottom + 4,
        left: r.left,
        width: Math.max(r.width, DROPDOWN_MIN_WIDTH),
      })
    }
    calcPos()
    // 자동 포커스 — calcPos 가 setPos 비동기라 다음 tick 으로
    const t = setTimeout(() => searchRef.current?.focus(), 0)
    // 바깥 클릭 / ESC / 스크롤·resize 위치 갱신
    const onDoc = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      close()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    const onScroll = () => calcPos()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <div className={s.pickerRoot}>
      <button
        ref={triggerRef}
        type="button"
        className={`${s.pickerTrigger} ${open ? s.pickerTriggerOpen : ''} ${disabled ? s.pickerDisabled : ''}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
      >
        {selected ? (
          <span className={s.pickerSelected}>
            <span className={s.pickerCode}>
              {composeFullCode(selected, catById, catParentOf) || selected.part_no}
            </span>
            {selected.name && <span className={s.pickerName}>· {selected.name}</span>}
            {selected.spec && <span className={s.pickerSpec}>· {selected.spec}</span>}
          </span>
        ) : (
          <span className={s.pickerPlaceholder}>{placeholder}</span>
        )}
        <span className={s.pickerCaret} aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          className={s.pickerDropdown}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
          }}
        >
          <input
            ref={searchRef}
            type="text"
            className={s.pickerSearch}
            placeholder="⌕  코드 / 품목명 / 규격 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className={s.pickerList}>
            {filtered.length === 0 ? (
              <li className={s.pickerEmpty}>일치하는 품목이 없어요</li>
            ) : (
              filtered.map((p) => {
                const code = composeFullCode(p, catById, catParentOf) || p.part_no
                const active = String(p.id) === String(value)
                return (
                  <li
                    key={p.id}
                    className={`${s.pickerItem} ${active ? s.pickerItemActive : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); pick(p) }}
                  >
                    {/* 한 줄 grid (2026-05-28 밀집형) — 코드 | 이름 | 규격 */}
                    <div className={s.pickerItemRow}>
                      <span className={s.pickerCode}>{code}</span>
                      <span className={s.pickerName}>{p.name || ''}</span>
                      <span className={s.pickerSpec}>{p.spec || ''}</span>
                    </div>
                  </li>
                )
              })
            )}
          </ul>
          <div className={s.pickerFooter}>
            <span>{filtered.length}개</span>
            <span className={s.pickerHint}>Esc 닫기</span>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
