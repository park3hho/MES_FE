// hooks/useColWidths.js
// 엑셀식 컬럼 너비 드래그 — 전체 100% 고정 안에서 재분배, localStorage 영속 (2026-05-20).
// ItemManagePage 내부 훅에서 분리 (2026-05-21).
//
// 사용 예:
//   const { tableRef, widths, startResize } = useColWidths({
//     storageKey: 'itemMaster.colW.v1',
//     defaults: [10, 16, 12, 9, 11, 11, 8, 7, 6, 10],  // 합 100(%)
//   })
//   <table ref={tableRef}>
//     <colgroup>{widths.map((w, i) => <col key={i} style={{width: `${w}%`}} />)}</colgroup>
//     ...
//     <th onMouseDown={startResize(0)}>품목번호</th>
//
// cascade 알고리즘:
//   드래그 오른쪽(=i 늘리기): j, j+1, j+2 ... 차례로 minPct 까지 깎아 가며 cascade 로 i 에 합산
//     → 옆 칸이 minPct 닿아도 멈추지 않고 다음 칸이 계속 밀림.
//   드래그 왼쪽(=i 줄이기): i 자신이 minPct 까지 → 줄어든 만큼 j 가 가져감 (자기 한계만 cascade 의미 없음).

import { useRef, useState } from 'react'

export function useColWidths({ storageKey, defaults, minPct = 4 }) {
  const tableRef = useRef(null)
  const [widths, setWidths] = useState(() => {
    try {
      const sv = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (
        Array.isArray(sv) &&
        sv.length === defaults.length &&
        sv.every((n) => Number.isFinite(n))
      )
        return sv
    } catch {
      /* localStorage 차단 환경 */
    }
    return defaults
  })
  const wref = useRef(widths)
  wref.current = widths

  const startResize = (idx) => (e) => {
    e.preventDefault()
    if (idx + 1 >= defaults.length) return
    const tableW = tableRef.current?.offsetWidth || 1
    const start = wref.current.slice()
    const startX = e.clientX
    const i = idx
    const j = idx + 1
    const move = (ev) => {
      const dPct = ((ev.clientX - startX) / tableW) * 100
      const w = start.slice()
      if (dPct >= 0) {
        // i 늘리기 — j 부터 우측으로 cascade shrink (각 minPct 까지)
        let need = dPct
        for (let k = j; k < w.length && need > 0; k += 1) {
          const can = w[k] - minPct
          if (can <= 0) continue
          const take = Math.min(can, need)
          w[k] -= take
          need -= take
        }
        w[i] += dPct - need   // 실제 확보된 폭만 추가 (모두 minPct 면 더 못 늘어남)
      } else {
        // i 줄이기 — 자기 minPct 까지만, 줄어든 만큼은 j 가 전부 흡수 (cascade 불필요)
        const want = -dPct
        const shrink = Math.min(w[i] - minPct, want)
        if (shrink > 0) {
          w[i] -= shrink
          w[j] += shrink
        }
      }
      wref.current = w
      setWidths(w)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      try {
        localStorage.setItem(storageKey, JSON.stringify(wref.current))
      } catch {
        /* */
      }
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }
  return { tableRef, widths, startResize }
}
