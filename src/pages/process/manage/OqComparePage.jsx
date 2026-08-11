// pages/process/manage/OqComparePage.jsx
// 재-OQ 값 비교 (2026-08-07) — 출하검사에서 떨어져 재작업된 제품을 다시 검사했을 때
//   1·2·3차 측정값을 한 화면에서 나란히 비교한다.
//
// 체인은 BE 가 잇는다 (services/lot/oq_compare_service.py):
//   OqInspection.prev_lot_so_no = 직전 OQ 의 SO LOT. 검사 저장 시 재공정 체인을 거슬러 1회 해석해 박아둔다.
//   여기선 그 결과를 시간순으로 받아 표로만 그린다.
//
// ★ 표는 '항목 × 회차' — 회차를 열로 둬야 값이 세로로 정렬돼 변화가 눈에 들어온다.
//   숫자 항목은 직전 회차 대비 증감(Δ)을 값 아래 작게 붙인다.
import { useState, useCallback } from 'react'

import { compareOqChain } from '@/api'
import { TableSkeleton } from '@/components/Skeleton'
import { fmtKstDate } from '@/utils/dateConvert'
import s from './OqComparePage.module.css'

const JUDGMENT_CLASS = { OK: s.bOK, FAIL: s.bFAIL }
const JUDGMENT_LABEL = { OK: '합격', FAIL: '불합격', RECHECK: '재검', PROBE: '탐색', PENDING: '미완' }

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const fmtNum = (v, digits) => (isNum(v) ? v.toFixed(digits) : null)

export default function OqComparePage({ onBack }) {
  const [keyword, setKeyword] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  const search = useCallback(async (kw) => {
    const q = (kw ?? keyword).trim()
    if (!q) return
    setLoading(true); setError(''); setSearched(true)
    try {
      setData(await compareOqChain(q))
    } catch (e) {
      setError(e.message || '조회 실패')
      setData(null)
    } finally { setLoading(false) }
  }, [keyword])

  const rounds = data?.rounds || []
  const unit = rounds[rounds.length - 1] || rounds[0] || null

  // 직전 회차 대비 증감 — 숫자 항목만. 첫 회차는 기준이라 표시하지 않는다.
  const deltaOf = (key, i, digits) => {
    if (i === 0) return null
    const cur = rounds[i].metrics?.[key]
    const prev = rounds[i - 1].metrics?.[key]
    if (!isNum(cur) || !isNum(prev)) return null
    const d = cur - prev
    if (Math.abs(d) < 10 ** -(digits + 1)) return { text: '변화 없음', cls: s.deltaFlat }
    return {
      text: `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(digits)}`,
      cls: d > 0 ? s.deltaUp : s.deltaDown,
    }
  }

  return (
    <div className="page-flat">
      <div className={s.headerRow}>
        <div className={`page-header ${s.headerMain}`}>
          <h1 className="page-title">재-OQ 값 비교</h1>
          <p className="page-subtitle">재작업 후 다시 출하검사한 제품의 회차별 측정값 비교</p>
        </div>
        {onBack && <button type="button" className={s.backLink} onClick={onBack}>← 이전</button>}
      </div>

      <div className={s.searchBar}>
        <input className={s.searchInput} value={keyword} autoFocus
          placeholder="SO LOT · OQ 번호 · ST 시리얼"
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search() }} />
        <button type="button" className={`btn-primary btn-lg ${s.searchBtn}`}
          disabled={loading || !keyword.trim()} onClick={() => search()}>
          {loading ? '조회 중' : '조회'}
        </button>
        <span className={s.searchHint}>
          어느 회차 번호로 검색해도 그 제품의 전체 검사 이력이 나옵니다.
        </span>
      </div>

      {error && <div className={s.error}>{error}</div>}

      {loading ? <TableSkeleton rows={6} /> : !data ? (
        <div className={s.empty}>
          {searched && !error
            ? '검사 이력이 없습니다.'
            : 'LOT 번호나 시리얼을 입력해 조회하세요.'}
        </div>
      ) : (
        <>
          <div className={s.unitBar}>
            <span className={s.unitTitle}>
              Φ{unit?.phi}
              {unit?.serial_no ? ` · ${unit.serial_no}` : ''}
            </span>
            <span className={s.roundCount}>검사 {data.count}회</span>
            <span className={s.unitSub}>
              {unit?.motor_type === 'inner' ? '내전형' : unit?.motor_type === 'outer' ? '외전형' : unit?.motor_type}
              {unit?.wire_type ? ` · ${unit.wire_type}` : ''}
            </span>
          </div>

          {data.count < 2 && (
            <div className={s.single}>
              이 제품은 출하검사 이력이 <b>1회</b>뿐입니다 — 재작업 후 재검사한 기록이 없어 비교할 대상이 없습니다.
              <br />재작업 이력이 있는데도 1회로 나온다면, 2026-06-04 이전 건이라 재공정 체인 기록이 없는 경우입니다.
            </div>
          )}

          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.rowHead}>항목</th>
                  {rounds.map((r) => (
                    <th key={r.id} className={r.is_entry ? s.colEntry : undefined}>
                      <span className={s.roundHead}>
                        <span className={s.roundNo}>{r.round}차</span>
                        <span className={s.roundLot}>{r.lot_oq_no || r.lot_so_no}</span>
                        <span className={s.roundDate}>{fmtKstDate(r.inspected_at)}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className={s.rowHead}>판정</th>
                  {rounds.map((r) => (
                    <td key={r.id} className={r.is_entry ? s.colEntry : undefined}>
                      <span className={`${s.badge} ${JUDGMENT_CLASS[r.judgment] || s.bETC}`}>
                        {JUDGMENT_LABEL[r.judgment] || r.judgment || '-'}
                      </span>
                    </td>
                  ))}
                </tr>

                {(data.metrics || []).map((m) => (
                  <tr key={m.key}>
                    <th className={s.rowHead}>
                      {m.label}{m.unit ? ` (${m.unit})` : ''}
                    </th>
                    {rounds.map((r, i) => {
                      const v = fmtNum(r.metrics?.[m.key], m.digits)
                      const d = deltaOf(m.key, i, m.digits)
                      return (
                        <td key={r.id} className={`${s.num} ${r.is_entry ? s.colEntry : ''}`}>
                          {v ?? <span className={s.none}>-</span>}
                          {d && <span className={`${s.delta} ${d.cls}`}>{d.text}</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {(data.flags || []).map((f) => (
                  <tr key={f.key}>
                    <th className={s.rowHead}>{f.label}</th>
                    {rounds.map((r) => {
                      const v = r.flags?.[f.key] || '-'
                      return (
                        <td key={r.id} className={r.is_entry ? s.colEntry : undefined}>
                          <span className={v === 'NG' ? s.flagNG : s.flagOK}>{v}</span>
                        </td>
                      )
                    })}
                  </tr>
                ))}

                <tr>
                  <th className={s.rowHead}>재작업 사유</th>
                  {rounds.map((r) => (
                    <td key={r.id} className={`${s.reason} ${r.is_entry ? s.colEntry : ''}`}>
                      {r.defect_category
                        ? `${r.defect_category}${r.defect_item ? ` / ${r.defect_item}` : ''}`
                        : r.repair_reason || <span className={s.none}>-</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className={s.rowHead}>비고</th>
                  {rounds.map((r) => (
                    <td key={r.id} className={`${s.reason} ${r.is_entry ? s.colEntry : ''}`}>
                      {r.remark || <span className={s.none}>-</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
