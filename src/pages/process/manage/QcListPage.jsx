// pages/process/manage/QcListPage.jsx
// QC 검사 이력 조회 (2026-05-30)
//
// 필터: 기간 / 검사구분 / 공정구분 / 제품구분 / 판정 / LOT 검색.
// 행 클릭 — 상세 모달 (간소화: 인라인 텍스트만, 수정은 별도 진입).
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { listQcInspections, downloadQcXlsx } from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import {
  QC_TYPE, QC_TYPE_LABELS,
  PROCESS_CATEGORY,
  PRODUCT_TYPE,
  QC_JUDGMENT, QC_JUDGMENT_LABELS,
} from '@/constants/qcConst'
import s from './QcListPage.module.css'


const fmtDate = (iso) => (iso ? iso.slice(0, 10) : '—')


export default function QcListPage({ onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [type, setType] = useState('')
  const [cat, setCat] = useState('')
  const [product, setProduct] = useState('')
  const [judgment, setJudgment] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [chainOrigin, setChainOrigin] = useState('')   // 재공정 chain 필터 (2026-06-04)

  const [downloading, setDownloading] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await listQcInspections({
        from: dateFrom || undefined,
        to: dateTo || undefined,
        inspection_type: type || undefined,
        process_category: cat || undefined,
        product_type: product || undefined,
        judgment: judgment || undefined,
        lot_no: lotNo || undefined,
        chain_origin: chainOrigin || undefined,
      })
      setItems(data.items || [])
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, type, cat, product, judgment, lotNo, chainOrigin])

  useEffect(() => { reload() }, [reload])

  // 엑셀 다운로드 — 현재 필터(기간/검사구분)만 BE 가 지원. 나머지 필터는 양식 export 후 사용자가 엑셀에서 필터.
  const onDownload = async () => {
    setDownloading(true)
    try {
      const blob = await downloadQcXlsx({
        from: dateFrom || undefined,
        to: dateTo || undefined,
        inspection_type: type || undefined,
      })
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
            title="현재 기간/검사구분 필터로 엑셀 양식 다운로드"
          >
            {downloading ? '다운로드 중…' : '⬇ 엑셀'}
          </button>
        }
      />

      {/* ── 필터 ── */}
      <div className={s.filters}>
        <input type="date" className="form-input" value={dateFrom}
               onChange={(e) => setDateFrom(e.target.value)} title="시작일" />
        <span>~</span>
        <input type="date" className="form-input" value={dateTo}
               onChange={(e) => setDateTo(e.target.value)} title="종료일" />
        <select className="form-input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">전체 검사구분</option>
          {Object.values(QC_TYPE).map((v) => (
            <option key={v} value={v}>{QC_TYPE_LABELS[v]}</option>
          ))}
        </select>
        <select className="form-input" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">전체 공정구분</option>
          {Object.values(PROCESS_CATEGORY).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="form-input" value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="">전체 제품구분</option>
          {Object.values(PRODUCT_TYPE).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="form-input" value={judgment} onChange={(e) => setJudgment(e.target.value)}>
          <option value="">전체 판정</option>
          {Object.values(QC_JUDGMENT).map((v) => (
            <option key={v} value={v}>{QC_JUDGMENT_LABELS[v]}</option>
          ))}
        </select>
        <input type="text" className="form-input" placeholder="LOT 검색" value={lotNo}
               onChange={(e) => setLotNo(e.target.value)} />
      </div>

      {/* ── 재공정 chain 활성 배너 — chain_origin 필터 적용 시 표시 (2026-06-04) ── */}
      {chainOrigin && (
        <div className={s.chainBanner}>
          <span>
            재공정 chain 필터: <b>{chainOrigin}</b> 에서 출발한 LOT 만 표시
          </span>
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
                <th>제품구분</th>
                <th>검사 대상</th>
                <th>사이즈</th>
                <th>LOT</th>
                <th title="재공정 chain 출발 LOT — 클릭 시 같은 chain 모든 LOT 필터">출발</th>
                <th>검사/양품/불량</th>
                <th>불량률</th>
                <th>판정</th>
                <th>처리방법</th>
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
                  <td className={s.lotCell}>{r.lot_no || '—'}</td>
                  <td className={s.originCell}>
                    {r.chain_origin
                      ? <button type="button" className={s.originChip}
                                title={`${r.chain_origin} 출발 chain 모두 보기`}
                                onClick={() => setChainOrigin(r.chain_origin)}>
                          {r.chain_origin}
                        </button>
                      : '—'}
                  </td>
                  <td className={s.qtyCell}>
                    {r.inspection_qty ?? '—'} / {r.good_qty ?? 0} / {r.defect_qty ?? 0}
                  </td>
                  <td>{r.defect_rate == null ? '—' : `${Number(r.defect_rate).toFixed(2)}%`}</td>
                  <td>
                    <span className={`${s.badge} ${r.judgment === QC_JUDGMENT.NG ? s.badgeNg : s.badgeOk}`}>
                      {r.judgment}
                    </span>
                  </td>
                  <td>{r.handle_method || '—'}</td>
                  <td>{r.inspector}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={s.count}>총 {items.length}건</p>
        </div>
      )}
    </div>
  )
}
