// pages/process/manage/QcListPage.jsx
// QC 검사 이력 조회 (2026-05-30, 다중 선택 칩 필터 2026-06-08)
//
// 필터: 기간 / 검사구분 / 공정구분 / 제품구분 / 판정 / LOT 검색.
// 다중 선택: 칩 토글 — 여러 값 동시 활성화 (쉼표 구분 → BE).
import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  listQcInspections,
  startQcXlsxJob, getQcXlsxProgress, downloadQcXlsxResult,
} from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import {
  QC_TYPE, QC_TYPE_LABELS,
  PROCESS_CATEGORY,
  PRODUCT_TYPE,
  QC_JUDGMENT, QC_JUDGMENT_LABELS, QC_JUDGMENT_COLORS,
} from '@/constants/qcConst'
import s from './QcListPage.module.css'


const fmtDate = (iso) => (iso ? iso.slice(0, 10) : '—')

// 측정값(EAV) 배열 → "최고 높이 12.3mm / 최저 높이 11.8mm" (없으면 —)
const fmtMeas = (arr) => {
  if (!arr || !arr.length) return '—'
  return arr.map((m) => `${m.label} ${m.value ?? '-'}${m.unit || ''}`).join(' / ')
}

// 이력 페이지 전용 badge 색 (2026-06-05) — PENDING/PROBE 주황 통일 (검사 미완료)
const HISTORY_BADGE_COLOR = {
  ...QC_JUDGMENT_COLORS,
  PENDING: '#e67e22',
  PROBE:   '#e67e22',
}

// ── 칩 필터 정의 ──
const TYPE_OPTIONS = Object.values(QC_TYPE).map((v) => [v, QC_TYPE_LABELS[v]])
const CAT_OPTIONS = Object.values(PROCESS_CATEGORY).map((v) => [v, v])
const PRODUCT_OPTIONS = Object.values(PRODUCT_TYPE).map((v) => [v, v])
const JUDGMENT_OPTIONS = Object.values(QC_JUDGMENT).map((v) => [v, QC_JUDGMENT_LABELS[v]])
// 공정 코드 필터 (2026-06-08) — BE _PROCESS_LOT_PREFIXES 매핑과 동기
const PROCESS_OPTIONS = [
  ['RM', '원자재'],
  ['MP', '자재준비'],
  ['EA', '낱장'],
  ['HT', '열처리'],
  ['BO', '본딩'],
  ['EC', '전착도장'],
  ['WI', '권선'],
  ['SO', '중성점'],
]

/** 다중 선택 칩 그룹 */
function ChipGroup({ label, items, selected, onChange }) {
  const toggle = (val) => {
    const next = new Set(selected)
    next.has(val) ? next.delete(val) : next.add(val)
    onChange(next)
  }
  return (
    <div className={s.chipRow}>
      <span className={s.chipLabel}>{label}</span>
      <div className={s.chipList}>
        {items.map(([value, text]) => (
          <button
            key={value}
            type="button"
            className={`${s.chip} ${selected.has(value) ? s.chipOn : ''}`}
            onClick={() => toggle(value)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Set → 쉼표 구분 문자열 (빈 Set → undefined) */
const csv = (set) => (set.size ? [...set].join(',') : undefined)


export default function QcListPage({ onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 기본 기간: 최근 1개월
  const _today = new Date()
  const _monthAgo = new Date(_today.getFullYear(), _today.getMonth() - 1, _today.getDate())
  const _ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const [dateFrom, setDateFrom] = useState(_ymd(_monthAgo))
  const [dateTo, setDateTo] = useState(_ymd(_today))

  // 다중 선택 필터 (Set)
  const [types, setTypes] = useState(new Set())
  const [cats, setCats] = useState(new Set())
  const [products, setProducts] = useState(new Set())
  const [judgments, setJudgments] = useState(new Set())
  const [processes, setProcesses] = useState(new Set())   // 공정 코드 (2026-06-08)

  const [lotNo, setLotNo] = useState('')
  const [chainOrigin, setChainOrigin] = useState('')

  const [downloading, setDownloading] = useState(false)
  const [dlProgress, setDlProgress] = useState(null)

  // 활성 필터 개수 (리셋 버튼 노출 조건)
  const activeFilterCount = types.size + cats.size + products.size + judgments.size + processes.size
  const clearAllFilters = () => {
    setTypes(new Set()); setCats(new Set()); setProducts(new Set())
    setJudgments(new Set()); setProcesses(new Set())
  }

  // 직렬화된 필터 키 (useCallback deps 최소화)
  const filterKey = useMemo(
    () => JSON.stringify([dateFrom, dateTo, csv(types), csv(cats), csv(products), csv(judgments), csv(processes), lotNo, chainOrigin]),
    [dateFrom, dateTo, types, cats, products, judgments, processes, lotNo, chainOrigin],
  )

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await listQcInspections({
        from: dateFrom || undefined,
        to: dateTo || undefined,
        inspection_type: csv(types),
        process_category: csv(cats),
        product_type: csv(products),
        judgment: csv(judgments),
        process: csv(processes),
        lot_no: lotNo || undefined,
        chain_origin: chainOrigin || undefined,
      })
      setItems(data.items || [])
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey])

  useEffect(() => { reload() }, [reload])

  // 엑셀 다운로드 — 백그라운드 job + 진척률 polling (2026-06-04)
  const onDownload = async () => {
    setDownloading(true)
    setDlProgress({ progress: 0, total: 0 })
    try {
      const filters = {
        from: dateFrom || undefined,
        to: dateTo || undefined,
        inspection_type: csv(types),
      }
      const { job_id } = await startQcXlsxJob(filters)

      let done = false
      while (!done) {
        await new Promise((r) => setTimeout(r, 1000))
        const p = await getQcXlsxProgress(job_id)
        setDlProgress({ progress: p.progress, total: p.total })
        if (p.error) throw new Error(p.error)
        if (p.done) done = true
      }

      const blob = await downloadQcXlsxResult(job_id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `QC_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      emitToast('엑셀 다운로드 완료', 'success')
    } catch (e) {
      emitToast(e.message || '다운로드 실패', 'error')
    } finally {
      setDownloading(false)
      setDlProgress(null)
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="품질검사 이력"
        onBack={onBack}
        action={
          <button
            className="btn-secondary btn-sm"
            onClick={onDownload}
            disabled={downloading || loading}
            title="현재 필터 기준 엑셀 양식 다운로드"
          >
            {downloading
              ? (dlProgress && dlProgress.total > 0
                  ? `${Math.round((dlProgress.progress / dlProgress.total) * 100)}%`
                  : '준비 중…')
              : '⬇ 엑셀'}
          </button>
        }
      />

      {/* ── 필터 바 ── */}
      <div className={s.filterBar}>
        {/* 기간 + LOT 검색 */}
        <div className={s.dateRow}>
          <input type="date" className={s.dateInput} value={dateFrom}
                 onChange={(e) => setDateFrom(e.target.value)} />
          <span className={s.dateSep}>~</span>
          <input type="date" className={s.dateInput} value={dateTo}
                 onChange={(e) => setDateTo(e.target.value)} />
          <input type="text" className={s.lotInput} placeholder="LOT 검색" value={lotNo}
                 onChange={(e) => setLotNo(e.target.value)} />
          {activeFilterCount > 0 && (
            <button type="button" className={s.clearBtn} onClick={clearAllFilters}>
              초기화
            </button>
          )}
        </div>

        {/* 칩 필터 그룹 */}
        <div className={s.chipArea}>
          <ChipGroup label="검사" items={TYPE_OPTIONS} selected={types} onChange={setTypes} />
          <ChipGroup label="판정" items={JUDGMENT_OPTIONS} selected={judgments} onChange={setJudgments} />
          <ChipGroup label="공정구분" items={CAT_OPTIONS} selected={cats} onChange={setCats} />
          <ChipGroup label="제품" items={PRODUCT_OPTIONS} selected={products} onChange={setProducts} />
          <ChipGroup label="공정" items={PROCESS_OPTIONS} selected={processes} onChange={setProcesses} />
        </div>
      </div>

      {/* ── 원본 LOT 필터 배너 ── */}
      {chainOrigin && (
        <div className={s.chainBanner}>
          <span>원본 LOT: <b>{chainOrigin}</b></span>
          <button className="btn-text" onClick={() => setChainOrigin('')}>← 전체로</button>
        </div>
      )}

      {/* ── 결과 ── */}
      {loading && <p className={s.empty}>불러오는 중…</p>}
      {error && <p className={s.error}>{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className={s.empty}>조건에 맞는 검사 이력이 없습니다.</p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>검사일</th>
                <th>구분</th>
                <th>공정</th>
                <th>제품</th>
                <th>대상</th>
                <th>사이즈</th>
                <th title="전착도장 높이 등 공정 측정값 (QcMeasurement)">측정값</th>
                <th title="이전 공정 LOT (검사 대상)">Prev</th>
                <th title="검사 번호">QC No</th>
                <th title="검사 통과 후 다음 공정 LOT">Post</th>
                <th title="원본 LOT (재공정 chain) — 클릭 시 필터">원본</th>
                <th>수량</th>
                <th>불량률</th>
                <th>판정</th>
                <th>처리</th>
                <th>검사자</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className={r.judgment === QC_JUDGMENT.NG ? s.rowNg : ''}>
                  <td>{fmtDate(r.inspection_date)}</td>
                  <td>{QC_TYPE_LABELS[r.inspection_type] || r.inspection_type}</td>
                  <td>{r.process_category}</td>
                  <td>{r.product_type}</td>
                  <td>{r.inspection_target}</td>
                  <td>{r.size || '—'}</td>
                  <td className={s.measCell}>{fmtMeas(r.measurements)}</td>
                  <td className={s.lotCell}>{r.lot_no_prev || '—'}</td>
                  <td className={s.lotCell}>{r.qc_no || '—'}</td>
                  <td className={s.lotCell}>{r.lot_no || '—'}</td>
                  <td className={s.originCell}>
                    {r.chain_origin
                      ? <button type="button" className={s.originChip}
                                title={`${r.chain_origin} 원본 LOT 의 모든 검사 보기`}
                                onClick={() => setChainOrigin(r.chain_origin)}>
                          {r.chain_origin}
                        </button>
                      : '—'}
                  </td>
                  <td className={s.qtyCell}>
                    {r.inspection_qty ?? '—'}/{r.good_qty ?? 0}/{r.defect_qty ?? 0}
                  </td>
                  <td>{r.defect_rate == null ? '—' : `${Number(r.defect_rate).toFixed(1)}%`}</td>
                  <td>
                    <span
                      className={s.badge}
                      style={{ background: `${HISTORY_BADGE_COLOR[r.judgment] || '#666'}14`, color: HISTORY_BADGE_COLOR[r.judgment] || '#666' }}
                    >
                      {QC_JUDGMENT_LABELS[r.judgment] || r.judgment}
                    </span>
                  </td>
                  <td>{r.handle_method || '—'}</td>
                  <td>{r.inspector || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={s.count}>{items.length}건</p>
        </div>
      )}
    </div>
  )
}
