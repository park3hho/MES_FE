// pages/process/manage/NonconformingListPage.jsx
// 부적합품 관리 — NCR(NonConformance) 기준 (2026-06-01 재작성)
//
// 진실의 원천 = NonConformance (status≠CLOSED 활성 목록). LOT 없는 부적합도 노출.
// 진입:
//   - 검사 발(IQ/IPQ NG, OQ 부적합확정) → BE 가 자동 NCR 생성 → 여기 표시
//   - 직접 등록 (작업자 발견/고객 반품/창고 손상) → '+ 직접 등록' 폼
// 처분: 조건부출하/용도변경/폐기/반품 (재공정 REWORK 은 검사화면에서 — 격리 충돌 회피).
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { listNc, createNc, disposeNc, closeNc } from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import { useConfirm, usePrompt } from '@/contexts/ConfirmDialogContext'
import {
  NC_SOURCE, NC_SOURCE_LABELS, NC_DISP, NC_STATUS, NC_STATUS_LABELS, NC_STATUS_COLORS,
} from '@/constants/ncConst'
import { RESPONSIBLE } from '@/constants/qcConst'
import s from './NonconformingListPage.module.css'


const fmtDate = (iso) => (iso ? iso.slice(0, 10) : '—')

// 직접 등록 소스 — 검사 발(IQ/IPQ/OQ)은 검사화면에서 자동 생성되므로 제외.
const DIRECT_SOURCES = [NC_SOURCE.MANUAL, NC_SOURCE.RETURN, NC_SOURCE.DAMAGE]
// 부적합품 관리 처분 — 재공정(REWORK)은 검사화면/LotManage 에서 (격리 LOT repair_lot 충돌 회피).
const DISPOSE_OPTIONS = [NC_DISP.CONCESSION, NC_DISP.USE_AS_IS, NC_DISP.SCRAP, NC_DISP.RETURN]

const EMPTY_REG = {
  source_type: NC_SOURCE.MANUAL, lot_no: '', material_desc: '',
  supplier: '', quantity: '', defect_detail: '', responsibility: '',
}


export default function NonconformingListPage({ onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')          // 진행 중 nc_no
  const [srcFilter, setSrcFilter] = useState('')

  const [showReg, setShowReg] = useState(false)
  const [reg, setReg] = useState(EMPTY_REG)
  const [regBusy, setRegBusy] = useState(false)
  const setR = (k, v) => setReg((p) => ({ ...p, [k]: v }))

  const confirm = useConfirm()
  const promptReason = usePrompt()

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await listNc(srcFilter ? { source_type: srcFilter } : {})
      setItems(data.items || [])
    } catch (e) {
      setError(e.message || '조회 실패')
    } finally {
      setLoading(false)
    }
  }, [srcFilter])

  useEffect(() => { reload() }, [reload])

  // ── 직접 등록 ──
  const onRegister = async () => {
    if (!reg.lot_no.trim() && !reg.material_desc.trim()) {
      emitToast('LOT 또는 품명 중 하나는 입력하세요.', 'error'); return
    }
    if (!reg.defect_detail.trim()) { emitToast('불량 내용을 입력하세요.', 'error'); return }
    setRegBusy(true)
    try {
      const res = await createNc({
        ...reg,
        quantity: reg.quantity === '' ? null : parseFloat(reg.quantity),
      })
      emitToast(`부적합 등록됨: ${res.nc_no}`, 'success')
      setReg(EMPTY_REG)
      setShowReg(false)
      await reload()
    } catch (e) {
      emitToast(e.message || '등록 실패', 'error')
    } finally {
      setRegBusy(false)
    }
  }

  // ── 처분 ──
  const onDispose = async (nc, disposition) => {
    if (!disposition) return
    const target = nc.lot_no || nc.material_desc || '대상'
    const reason = await promptReason({
      title: `${disposition} 처분`,
      message: `${nc.nc_no} (${target}) 을(를) "${disposition}"(으)로 처분합니다.`,
      inputLabel: '처분 사유 (선택)',
      inputPlaceholder: '예: 고객 합의 후 반품',
      confirmText: '처분',
      danger: disposition === NC_DISP.SCRAP,
    })
    if (reason === null) return       // 취소
    setBusy(nc.nc_no)
    try {
      await disposeNc(nc.nc_no, disposition, null, reason)
      emitToast(`처분 완료: ${disposition}`, 'success')
      await reload()
    } catch (e) {
      emitToast(e.message || '처분 실패', 'error')
    } finally {
      setBusy('')
    }
  }

  // ── 종결 ──
  const onCloseNc = async (nc) => {
    const ok = await confirm({
      title: '종결',
      message: `${nc.nc_no} 를 종결하시겠어요? 종결 후에는 활성 목록에서 사라집니다.`,
      confirmText: '종결',
    })
    if (!ok) return
    setBusy(nc.nc_no)
    try {
      await closeNc(nc.nc_no)
      emitToast('종결 완료', 'success')
      await reload()
    } catch (e) {
      emitToast(e.message || '종결 실패', 'error')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="부적합품 관리"
        subtitle="검사 발생분 + 직접 등록(작업자 발견·반품·손상)"
        onBack={onBack}
        action={
          <button className="btn-primary btn-sm" onClick={() => setShowReg((v) => !v)}>
            {showReg ? '닫기' : '+ 직접 등록'}
          </button>
        }
      />

      {/* ── 직접 등록 폼 ── */}
      {showReg && (
        <div className={s.regForm}>
          <div className={s.regRow}>
            <div className={s.regField}>
              <label className={s.regLabel}>발생 소스</label>
              <div className={s.srcBtns}>
                {DIRECT_SOURCES.map((src) => (
                  <button key={src} type="button"
                    className={`${s.srcBtn} ${reg.source_type === src ? s.srcBtnOn : ''}`}
                    onClick={() => setR('source_type', src)}>
                    {NC_SOURCE_LABELS[src]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={s.regRow}>
            <div className={s.regField}>
              <label className={s.regLabel}>LOT (있으면)</label>
              <input className="form-input" value={reg.lot_no}
                onChange={(e) => setR('lot_no', e.target.value)} placeholder="LOT 번호" />
            </div>
            <div className={s.regField}>
              <label className={s.regLabel}>품명 (LOT 없으면)</label>
              <input className="form-input" value={reg.material_desc}
                onChange={(e) => setR('material_desc', e.target.value)} placeholder="예: 에나멜 동선" />
            </div>
          </div>
          <div className={s.regRow}>
            <div className={s.regField}>
              <label className={s.regLabel}>공급/입고업체</label>
              <input className="form-input" value={reg.supplier}
                onChange={(e) => setR('supplier', e.target.value)} />
            </div>
            <div className={s.regField}>
              <label className={s.regLabel}>수량</label>
              <input type="number" min="0" step="any" className="form-input" value={reg.quantity}
                onChange={(e) => setR('quantity', e.target.value)} />
            </div>
            <div className={s.regField}>
              <label className={s.regLabel}>귀책대상</label>
              <select className="form-input" value={reg.responsibility}
                onChange={(e) => setR('responsibility', e.target.value)}>
                <option value="">선택</option>
                {Object.values(RESPONSIBLE).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className={s.regRow}>
            <div className={`${s.regField} ${s.regFieldWide}`}>
              <label className={s.regLabel}>불량 내용 *</label>
              <input className="form-input" value={reg.defect_detail}
                onChange={(e) => setR('defect_detail', e.target.value)} placeholder="불량 상세 내용" />
            </div>
          </div>
          <div className={s.regActions}>
            <button className="btn-primary btn-md" onClick={onRegister} disabled={regBusy}>
              {regBusy ? '등록 중…' : '부적합 등록'}
            </button>
          </div>
        </div>
      )}

      {/* ── 소스 필터 ── */}
      <div className={s.filters}>
        <select className={`form-input ${s.filterSelect}`} value={srcFilter} onChange={(e) => setSrcFilter(e.target.value)}>
          <option value="">전체 소스</option>
          {Object.values(NC_SOURCE).map((src) => (
            <option key={src} value={src}>{NC_SOURCE_LABELS[src]}</option>
          ))}
        </select>
        <button className={`btn-secondary btn-sm ${s.refreshBtn}`} onClick={reload} disabled={loading}>
          {loading ? '새로고침…' : '🔄'}
        </button>
      </div>

      {loading && <p className={s.empty}>불러오는 중…</p>}
      {error && <p className={s.error}>{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className={s.empty}>활성 부적합품이 없습니다.</p>
      )}

      {!loading && !error && items.length > 0 && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>NCR</th><th>소스</th><th>대상</th><th>불량내용</th>
                <th>수량</th><th>처분</th><th>상태</th><th>발생일</th>
                <th className={s.actionsCol}>액션</th>
              </tr>
            </thead>
            <tbody>
              {items.map((nc) => {
                const b = busy === nc.nc_no
                const col = NC_STATUS_COLORS[nc.status] || {}
                const isDisposed = nc.status === NC_STATUS.DISPOSED
                const isActive = nc.status === NC_STATUS.OPEN || nc.status === NC_STATUS.INVESTIGATION
                return (
                  <tr key={nc.nc_no}>
                    <td className={s.lotCell}><span className={s.ncrChip}>{nc.nc_no}</span></td>
                    <td><span className={s.sourceTag}>{NC_SOURCE_LABELS[nc.source_type] || nc.source_type}</span></td>
                    <td className={s.targetCell}>{nc.lot_no || nc.material_desc || '—'}</td>
                    <td className={s.reasonCell} title={nc.defect_detail}>{nc.defect_detail || '—'}</td>
                    <td className={s.qtyCell}>{nc.quantity ?? '—'}</td>
                    <td>
                      {(!nc.disposition || nc.disposition === NC_DISP.PENDING)
                        ? <span className={s.dispMuted}>{NC_DISP.PENDING}</span>
                        : <span className={s.dispValue}>{nc.disposition}</span>}
                    </td>
                    <td>
                      <span className={s.badge} style={{ background: col.bg, color: col.fg }}>
                        {NC_STATUS_LABELS[nc.status] || nc.status}
                      </span>
                    </td>
                    <td className={s.smallCell}>{fmtDate(nc.created_at)}</td>
                    <td className={s.actionsCol}>
                      <div className={s.actionsCell}>
                        {isActive && (
                          <select className={s.dispSelect} disabled={!!busy}
                            value="" onChange={(e) => onDispose(nc, e.target.value)}>
                            <option value="">처분…</option>
                            {DISPOSE_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                          </select>
                        )}
                        {isDisposed && (
                          <button className="btn-secondary btn-sm" onClick={() => onCloseNc(nc)} disabled={b}>
                            종결
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className={s.count}>총 {items.length}건</p>
        </div>
      )}
    </div>
  )
}
