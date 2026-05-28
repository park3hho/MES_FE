// BomPartPicker — BOM 편집의 품목 선택 dropdown 대체 (2026-05-27)
//   기존 native <select> 가 풀 식별코드+이름+규격을 한 줄에 우겨넣어 길어지던 문제 해결.
//   카드형 항목 + 실시간 검색 + 바깥클릭/ESC 닫기. 모달보다 데스크탑 흐름에 자연.
//
// 사용:
//   <BomPartPicker
//     value={h.parent_part_id}            // 현재 선택 id (number | null)
//     onChange={(id) => set('parent_part_id', id)}
//     parts={allParts}                    // 후보 [{id, part_no, name, spec, category_id, reserved, etc}]
//     catById={catById}                   // flattenTree(catTree) 결과
//     catParentOf={catParentOf}
//     disabled={!isNew}
//   />
import { useState, useEffect, useRef, useMemo } from 'react'
import { composeFullCode } from '@/utils/categoryTree'
import s from './BomPartPicker.module.css'

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
  const rootRef = useRef(null)
  const searchRef = useRef(null)

  // 현재 값 — id 비교는 string 통일 (DB 가 number, native select 잔재가 string 일 수 있음)
  const selected = useMemo(
    () => parts.find((p) => String(p.id) === String(value)) || null,
    [parts, value],
  )

  // 검색 필터 — 코드(풀)/이름/규격/raw part_no 어디든 매칭
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
  }
  const pick = (p) => {
    onChange(p.id)
    close()
  }

  // 바깥 클릭 / ESC → 닫기. 열림 시 검색 input 자동 포커스.
  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) close()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={s.pickerRoot} ref={rootRef}>
      <button
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
      {open && (
        <div className={s.pickerDropdown}>
          <input
            ref={searchRef}
            type="text"
            className={s.pickerSearch}
            placeholder="🔍 코드 / 품목명 / 규격 검색"
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
                    <div className={s.pickerItemMain}>
                      <span className={s.pickerCode}>{code}</span>
                      {p.name && <span className={s.pickerName}>{p.name}</span>}
                    </div>
                    {p.spec && <div className={s.pickerItemSub}>{p.spec}</div>}
                  </li>
                )
              })
            )}
          </ul>
          <div className={s.pickerFooter}>
            <span>{filtered.length}개</span>
            <span className={s.pickerHint}>Esc 닫기</span>
          </div>
        </div>
      )}
    </div>
  )
}
