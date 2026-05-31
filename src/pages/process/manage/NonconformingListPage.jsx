// pages/process/manage/NonconformingListPage.jsx
// 부적합품 관리 — 격리된 LOT 의 폐기/되살리기 (2026-05-31)
//
// QcRecordPage 에서 mark_nonconforming 한 LOT 는 Inventory.status='nonconforming' 으로 격리됨.
// 이 페이지에서:
//   - 격리 목록 조회 (각 행: LOT + 공정 + 수량 + 연관 NG QC 검사 메타)
//   - [폐기] 클릭 → Inventory.status='discarded' (최종 처분)
//   - [되살리기] 클릭 → Inventory.status='in_stock' (격리 해제, 재고 복귀)

import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import {
  listQcNonconforming, discardQcNonconforming, restoreQcNonconforming,
} from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import s from './NonconformingListPage.module.css'


const fmtDate = (iso) => (iso ? iso.slice(0, 10) : '—')
const fmtDateTime = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${String(d.getFullYear()).slice(2)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}


export default function NonconformingListPage({ onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionBusy, setActionBusy] = useState('')   // 진행 중인 LOT 번호

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await listQcNonconforming()
      setItems(data.items || [])
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const onDiscard = async (lotNo) => {
    if (!window.confirm(`${lotNo} 를 폐기 확정하시겠어요? (되돌릴 수 없음)`)) return
    const reason = window.prompt('폐기 확정 사유 (선택, 비워두면 기본 문구 사용):', '') ?? ''
    setActionBusy(lotNo)
    try {
      const res = await discardQcNonconforming(lotNo, reason)
      emitToast(
        res.affected_inventory_rows
          ? `폐기 확정 완료 (재고 ${res.affected_inventory_rows}행)`
          : '폐기 확정 완료',
        'success',
      )
      await reload()
    } catch (e) {
      emitToast(e.message || '폐기 확정 실패', 'error')
    } finally {
      setActionBusy('')
    }
  }

  const onRestore = async (lotNo) => {
    if (!window.confirm(`${lotNo} 의 격리를 해제하고 재고로 되살릴까요?`)) return
    const reason = window.prompt('되살리기 사유 (선택):', '') ?? ''
    setActionBusy(lotNo)
    try {
      const res = await restoreQcNonconforming(lotNo, reason)
      emitToast(
        res.affected_inventory_rows
          ? `되살리기 완료 (재고 ${res.affected_inventory_rows}행 복귀)`
          : '되살리기 완료',
        'success',
      )
      await reload()
    } catch (e) {
      emitToast(e.message || '되살리기 실패', 'error')
    } finally {
      setActionBusy('')
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="부적합품 관리"
        subtitle="격리된 LOT 의 폐기 / 되살리기"
        onBack={onBack}
        action={
          <button className="btn-secondary btn-sm" onClick={reload} disabled={loading}>
            {loading ? '새로고침…' : '🔄'}
          </button>
        }
      />

      {loading && <p className={s.empty}>불러오는 중…</p>}
      {error && <p className={s.error}>{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className={s.empty}>현재 격리된 부적합품이 없습니다.</p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>LOT</th>
                <th>공정</th>
                <th>파이</th>
                <th>수량</th>
                <th>격리 시각</th>
                <th>사유</th>
                <th>검사</th>
                <th>검사자</th>
                <th>불량/검사</th>
                <th className={s.actionsCol}>액션</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const busy = actionBusy === r.lot_no
                return (
                  <tr key={r.lot_no}>
                    <td className={s.lotCell}>{r.lot_no}</td>
                    <td>{r.process}</td>
                    <td>{r.group_key || '—'}</td>
                    <td className={s.qtyCell}>{r.quantity ?? '—'}</td>
                    <td className={s.smallCell}>{fmtDateTime(r.marked_at)}</td>
                    <td className={s.reasonCell} title={r.reason}>{r.reason || '—'}</td>
                    <td className={s.smallCell}>{fmtDate(r.inspection_date)}</td>
                    <td>{r.inspector || '—'}</td>
                    <td className={s.qtyCell}>
                      {r.defect_qty ?? '—'} / {r.inspection_qty ?? '—'}
                    </td>
                    <td className={s.actionsCol}>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => onRestore(r.lot_no)}
                        disabled={!!actionBusy}
                        title="격리 해제 — 재고로 되살림"
                      >
                        되살리기
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => onDiscard(r.lot_no)}
                        disabled={!!actionBusy}
                        title="최종 폐기 처리"
                      >
                        {busy ? '…' : '폐기'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className={s.count}>총 {items.length}건 격리 중</p>
        </div>
      )}
    </div>
  )
}
