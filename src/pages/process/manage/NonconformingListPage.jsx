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
import {
  listNc, createNc, updateNc, disposeNc, closeNc, printNcLabel,
  listWarehouseBox, placeInBox,
  listWarehouseRack, setNcLocation,
} from '@/api'
import { emitToast } from '@/contexts/ToastContext'
import { useConfirm, usePrompt } from '@/contexts/ConfirmDialogContext'
import {
  NC_SOURCE, NC_SOURCE_LABELS, NC_DISP, NC_STATUS, NC_STATUS_LABELS, NC_STATUS_COLORS,
} from '@/constants/ncConst'
import { RESPONSIBLE } from '@/constants/qcConst'
import s from './NonconformingListPage.module.css'


const fmtDate = (iso) => (iso ? iso.slice(0, 10) : '—')

// ── 심플 라인 아이콘 (16px, stroke 기반) ──
const IconBox = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const IconPin = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

const rng = (n) => Array.from({ length: Math.max(0, Number(n) || 0) }, (_, i) => i + 1)

const IconEdit = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)
const IconPrint = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9V2h12v7" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
  </svg>
)

// 직접 등록 소스 — 검사 발(IQ/IPQ/OQ)은 검사화면에서 자동 생성되므로 제외.
const DIRECT_SOURCES = [NC_SOURCE.MANUAL, NC_SOURCE.RETURN, NC_SOURCE.DAMAGE]
// 부적합품 관리 처분 — 재공정(REWORK)은 검사화면/LotManage 에서 (격리 LOT repair_lot 충돌 회피).
const DISPOSE_OPTIONS = [NC_DISP.CONCESSION, NC_DISP.USE_AS_IS, NC_DISP.SCRAP, NC_DISP.RETURN]

const EMPTY_REG = {
  source_type: NC_SOURCE.MANUAL, lot_no: '', product_code: '', material_desc: '',
  supplier: '', supplier_lot_no: '', process: '', quantity: '',
  defect_type: '', defect_detail: '', responsibility: '', remark: '',
}


export default function NonconformingListPage({ onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')          // 진행 중 nc_no
  const [srcFilter, setSrcFilter] = useState('')

  const [showReg, setShowReg] = useState(false)
  const [editingNc, setEditingNc] = useState(null)   // null = 신규 등록, 객체 = 수정 모드
  const [reg, setReg] = useState(EMPTY_REG)
  const [regBusy, setRegBusy] = useState(false)
  const setR = (k, v) => setReg((p) => ({ ...p, [k]: v }))

  // 박스에 담기 (2026-06-09) — BoxContent junction 사용. 박스 선택 모달.
  const [boxModal, setBoxModal] = useState(null)   // {nc, selectedBoxId} | null
  const [boxList, setBoxList] = useState([])
  const [boxBusy, setBoxBusy] = useState(false)
  const openBoxModal = async (nc) => {
    try {
      const data = await listWarehouseBox()
      setBoxList(data.items || data || [])
      setBoxModal({ nc, selectedBoxId: null })
    } catch (e) {
      emitToast(e.message || '박스 목록 불러오기 실패', 'error')
    }
  }
  const closeBoxModal = () => setBoxModal(null)
  const onPlaceInBox = async () => {
    if (!boxModal?.selectedBoxId) {
      emitToast('박스를 선택하세요.', 'error'); return
    }
    setBoxBusy(true)
    try {
      await placeInBox(boxModal.selectedBoxId, {
        item_type: 'nc',
        item_id: boxModal.nc.id,
        qty: boxModal.nc.quantity ?? null,
      })
      emitToast('박스에 담았습니다.', 'success')
      closeBoxModal()
      await reload()
    } catch (e) {
      emitToast(e.message || '박스 담기 실패', 'error')
    } finally {
      setBoxBusy(false)
    }
  }

  // 위치 지정 (2026-06-10) — 박스 없이 랙/단/칸 직접 지정
  const [locModal, setLocModal] = useState(null)   // {nc, rack_id, shelf, bin} | null
  const [rackList, setRackList] = useState([])
  const [locBusy, setLocBusy] = useState(false)
  const openLocModal = async (nc) => {
    try {
      const data = await listWarehouseRack()
      setRackList(data.items || data || [])
      setLocModal({ nc, rack_id: nc.rack_id ?? null, shelf: nc.shelf ?? null, bin: nc.bin ?? null })
    } catch (e) {
      emitToast(e.message || '랙 목록 불러오기 실패', 'error')
    }
  }
  const closeLocModal = () => setLocModal(null)
  const onSaveLocation = async () => {
    setLocBusy(true)
    try {
      await setNcLocation(locModal.nc.nc_no, {
        rack_id: locModal.rack_id ?? null,
        shelf: locModal.rack_id ? (locModal.shelf ?? null) : null,
        bin: locModal.rack_id ? (locModal.bin ?? null) : null,
      })
      emitToast(locModal.rack_id ? '위치를 지정했습니다.' : '위치를 해제했습니다.', 'success')
      closeLocModal()
      await reload()
    } catch (e) {
      emitToast(e.message || '위치 지정 실패', 'error')
    } finally {
      setLocBusy(false)
    }
  }

  // 신규 등록 폼 열기
  const openNew = () => {
    setEditingNc(null)
    setReg(EMPTY_REG)
    setShowReg(true)
  }
  // 수정 폼 열기 — 기존 NCR 값 채움
  const openEdit = (nc) => {
    setEditingNc(nc)
    setReg({
      source_type: nc.source_type,
      lot_no: nc.lot_no || '',
      product_code: nc.product_code || '',
      material_desc: nc.material_desc || '',
      supplier: nc.supplier || '',
      supplier_lot_no: nc.supplier_lot_no || '',
      process: nc.process || '',
      quantity: nc.quantity != null ? String(nc.quantity) : '',
      defect_type: nc.defect_type || '',
      defect_detail: nc.defect_detail || '',
      responsibility: nc.responsibility || '',
      remark: nc.remark || '',
    })
    setShowReg(true)
  }
  const closeForm = () => { setShowReg(false); setEditingNc(null); setReg(EMPTY_REG) }

  // 모달 ESC 닫기
  useEffect(() => {
    if (!showReg) return
    const onKey = (e) => { if (e.key === 'Escape') closeForm() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showReg])

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

  // ── 직접 등록 / 수정 (editingNc 유무로 분기) ──
  const onRegister = async () => {
    if (!reg.lot_no.trim() && !reg.material_desc.trim()) {
      emitToast('LOT 또는 품명 중 하나는 입력하세요.', 'error'); return
    }
    if (!reg.defect_detail.trim()) { emitToast('불량 내용을 입력하세요.', 'error'); return }
    setRegBusy(true)
    try {
      const qty = reg.quantity === '' ? null : parseFloat(reg.quantity)
      if (editingNc) {
        // 수정 — LOT/처분/상태는 불변. 보정 가능 필드만 PATCH.
        const patch = {
          product_code: reg.product_code,
          material_desc: reg.material_desc,
          supplier: reg.supplier,
          supplier_lot_no: reg.supplier_lot_no,
          process: reg.process,
          quantity: qty,
          defect_type: reg.defect_type,
          defect_detail: reg.defect_detail,
          responsibility: reg.responsibility,
          remark: reg.remark,
        }
        // 발생 소스 — 직접 등록 소스(작업자발견/반품/창고손상)끼리만 변경 가능 (검사 발생분은 불변)
        if (DIRECT_SOURCES.includes(editingNc.source_type)) {
          patch.source_type = reg.source_type
        }
        await updateNc(editingNc.nc_no, patch)
        emitToast(`수정 완료: ${editingNc.nc_no}`, 'success')
      } else {
        const res = await createNc({ ...reg, quantity: qty })
        emitToast(`부적합 등록됨: ${res.nc_no}`, 'success')
      }
      closeForm()
      await reload()
    } catch (e) {
      emitToast(e.message || (editingNc ? '수정 실패' : '등록 실패'), 'error')
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

  // ── 부적합 라벨 출력 (QR=nc_no, 영어 전용) ──
  const onPrintLabel = async (nc) => {
    setBusy(nc.nc_no)
    try {
      await printNcLabel(nc.nc_no)
      emitToast('부적합 라벨 출력됨', 'success')
    } catch (e) {
      emitToast(e.message || '라벨 출력 실패', 'error')
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
          <button className="btn-primary btn-sm" onClick={() => (showReg ? closeForm() : openNew())}>
            {showReg ? '닫기' : '+ 직접 등록'}
          </button>
        }
      />

      {/* ── 등록 / 수정 모달 (editingNc 유무로 분기) ── */}
      {showReg && (
        <div className="overlay" onMouseDown={closeForm}>
          <div className={s.modalCard} onMouseDown={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <div className={s.modalTitleWrap}>
                <h3 className={s.modalTitle}>{editingNc ? '부적합 정보 수정' : '부적합 직접 등록'}</h3>
                {editingNc && (
                  <span className={s.modalSub}>
                    <span className={s.ncrChip}>{editingNc.nc_no}</span>
                    {/* 검사 발생분은 소스 불변 → 라벨 표시. 직접 등록 소스는 아래에서 편집. */}
                    {!DIRECT_SOURCES.includes(editingNc.source_type)
                      && (NC_SOURCE_LABELS[editingNc.source_type] || editingNc.source_type)}
                  </span>
                )}
              </div>
              <button type="button" className={s.modalClose} onClick={closeForm} aria-label="닫기">✕</button>
            </div>

            <div className={s.modalBody}>
              {/* 발생 소스 — 신규 등록 또는 직접 등록 소스(작업자발견/반품/창고손상) 수정 시 선택 가능.
                  검사 발생분(IQ/IPQ/OQ) 수정 시엔 불변 → 헤더에 라벨로만 표시. */}
              {(!editingNc || DIRECT_SOURCES.includes(editingNc.source_type)) && (
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
              )}
              <div className={s.regRow}>
                <div className={s.regField}>
                  <label className={s.regLabel}>LOT {editingNc ? '(불변)' : '(있으면)'}</label>
                  <input className="form-input" value={reg.lot_no} disabled={!!editingNc}
                    onChange={(e) => setR('lot_no', e.target.value)} placeholder="LOT 번호" />
                </div>
                <div className={s.regField}>
                  <label className={s.regLabel}>품명 {editingNc ? '' : '(LOT 없으면)'}</label>
                  <input className="form-input" value={reg.material_desc}
                    onChange={(e) => setR('material_desc', e.target.value)} placeholder="예: 에나멜 동선" />
                </div>
              </div>
              <div className={s.regRow}>
                <div className={s.regField}>
                  <label className={s.regLabel}>제품번호 (P/N) <small style={{ color: 'var(--color-text-sub)' }}>· LOT 없을 때 라벨 식별용</small></label>
                  <input className="form-input" value={reg.product_code}
                    onChange={(e) => setR('product_code', e.target.value)}
                    placeholder="예: FD-RO-20-07-g30-A-F (영문/숫자만)" />
                </div>
                <div className={s.regField}>
                  <label className={s.regLabel}>공정</label>
                  <input className="form-input" value={reg.process}
                    onChange={(e) => setR('process', e.target.value)}
                    placeholder="예: HT / BO / EC / WI" />
                </div>
              </div>
              <div className={s.regRow}>
                <div className={s.regField}>
                  <label className={s.regLabel}>공급/입고업체</label>
                  <input className="form-input" value={reg.supplier}
                    onChange={(e) => setR('supplier', e.target.value)} />
                </div>
                <div className={s.regField}>
                  <label className={s.regLabel}>공급사 LOT</label>
                  <input className="form-input" value={reg.supplier_lot_no}
                    onChange={(e) => setR('supplier_lot_no', e.target.value)}
                    placeholder="공급사 발급 LOT 번호" />
                </div>
              </div>
              <div className={s.regRow}>
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
                <div className={s.regField}>
                  <label className={s.regLabel}>불량 유형</label>
                  <input className="form-input" value={reg.defect_type}
                    onChange={(e) => setR('defect_type', e.target.value)}
                    placeholder="예: 치수불량 / 외관불량 / 도금" />
                </div>
                <div className={`${s.regField} ${s.regFieldWide}`}>
                  <label className={s.regLabel}>불량 내용 *</label>
                  <input className="form-input" value={reg.defect_detail}
                    onChange={(e) => setR('defect_detail', e.target.value)} placeholder="불량 상세 내용" />
                </div>
              </div>
              <div className={s.regRow}>
                <div className={`${s.regField} ${s.regFieldWide}`}>
                  <label className={s.regLabel}>비고</label>
                  <input className="form-input" value={reg.remark}
                    onChange={(e) => setR('remark', e.target.value)} placeholder="처리 메모·특이사항 (선택)" />
                </div>
              </div>
            </div>

            <div className={s.modalFooter}>
              <button className="btn-secondary btn-md" onClick={closeForm} disabled={regBusy}>취소</button>
              <button className="btn-primary btn-md" onClick={onRegister} disabled={regBusy}>
                {regBusy ? '저장 중…' : (editingNc ? '수정 저장' : '부적합 등록')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 박스에 담기 모달 (2026-06-09) ── */}
      {boxModal && (
        <div className="overlay" onMouseDown={closeBoxModal}>
          <div className={s.modalCard} onMouseDown={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <div className={s.modalTitleWrap}>
                <h3 className={s.modalTitle}>박스에 담기</h3>
                <span className={s.modalSub}>
                  <span className={s.ncrChip}>{boxModal.nc.nc_no}</span>
                  {boxModal.nc.material_desc || boxModal.nc.product_code || boxModal.nc.source_lot_no || '—'}
                </span>
              </div>
              <button type="button" className={s.modalClose} onClick={closeBoxModal} aria-label="닫기">✕</button>
            </div>
            <div className={s.modalBody}>
              <div className={s.regRow}>
                <div className={`${s.regField} ${s.regFieldWide}`}>
                  <label className={s.regLabel}>박스 선택</label>
                  <select className="form-input"
                    value={boxModal.selectedBoxId ?? ''}
                    onChange={(e) => setBoxModal((p) => ({
                      ...p, selectedBoxId: e.target.value ? Number(e.target.value) : null,
                    }))}>
                    <option value="">박스 선택…</option>
                    {boxList.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name || b.code} · {b.location_full || '위치 미지정'}
                        {b.item_count ? ` · 보관 ${b.item_count}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {boxList.length === 0 && (
                <p className={s.empty}>등록된 박스가 없습니다. 창고에서 박스 먼저 등록하세요.</p>
              )}
            </div>
            <div className={s.modalFooter}>
              <button className="btn-secondary btn-md" onClick={closeBoxModal} disabled={boxBusy}>취소</button>
              <button className="btn-primary btn-md" onClick={onPlaceInBox}
                disabled={boxBusy || !boxModal.selectedBoxId}>
                {boxBusy ? '담는 중…' : '담기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 위치 지정 모달 (2026-06-10) — 박스 없이 랙/단/칸 직접 ── */}
      {locModal && (() => {
        const selRack = rackList.find((r) => r.id === locModal.rack_id)
        return (
          <div className="overlay" onMouseDown={closeLocModal}>
            <div className={s.modalCard} onMouseDown={(e) => e.stopPropagation()}>
              <div className={s.modalHeader}>
                <div className={s.modalTitleWrap}>
                  <h3 className={s.modalTitle}>위치 지정</h3>
                  <span className={s.modalSub}>
                    <span className={s.ncrChip}>{locModal.nc.nc_no}</span>
                    {locModal.nc.material_desc || locModal.nc.product_code || locModal.nc.source_lot_no || '—'}
                  </span>
                </div>
                <button type="button" className={s.modalClose} onClick={closeLocModal} aria-label="닫기">✕</button>
              </div>
              <div className={s.modalBody}>
                <div className={s.regRow}>
                  <div className={`${s.regField} ${s.regFieldWide}`}>
                    <label className={s.regLabel}>랙 (비우면 위치 해제)</label>
                    <select className="form-input" value={locModal.rack_id ?? ''}
                      onChange={(e) => setLocModal((p) => ({
                        ...p, rack_id: e.target.value ? Number(e.target.value) : null, shelf: null, bin: null,
                      }))}>
                      <option value="">랙 선택…</option>
                      {rackList.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.shelf_count}단×{r.bin_count}칸)</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className={s.regRow}>
                  <div className={s.regField}>
                    <label className={s.regLabel}>단(Shelf)</label>
                    <select className="form-input" value={locModal.shelf ?? ''} disabled={!selRack}
                      onChange={(e) => setLocModal((p) => ({ ...p, shelf: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">단</option>
                      {rng(selRack?.shelf_count).map((n) => <option key={n} value={n}>{n}단</option>)}
                    </select>
                  </div>
                  <div className={s.regField}>
                    <label className={s.regLabel}>칸(Bin)</label>
                    <select className="form-input" value={locModal.bin ?? ''} disabled={!selRack}
                      onChange={(e) => setLocModal((p) => ({ ...p, bin: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">칸</option>
                      {rng(selRack?.bin_count).map((n) => <option key={n} value={n}>{n}칸</option>)}
                    </select>
                  </div>
                </div>
                {rackList.length === 0 && (
                  <p className={s.empty}>등록된 랙이 없습니다. 창고에서 랙 먼저 등록하세요.</p>
                )}
              </div>
              <div className={s.modalFooter}>
                <button className="btn-secondary btn-md" onClick={closeLocModal} disabled={locBusy}>취소</button>
                <button className="btn-primary btn-md" onClick={onSaveLocation} disabled={locBusy}>
                  {locBusy ? '저장 중…' : (locModal.rack_id ? '위치 지정' : '위치 해제')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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
                <th>NCR</th><th>소스</th><th>대상</th><th>불량내용</th><th>비고</th>
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
                    <td className={s.reasonCell} title={nc.remark}>{nc.remark || '—'}</td>
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
                        <button className={s.iconBtn} onClick={() => openEdit(nc)} disabled={b} title="정보 수정">
                          <IconEdit />
                        </button>
                        <button className={s.iconBtn} onClick={() => openBoxModal(nc)} disabled={b} title="박스에 담기">
                          <IconBox />
                        </button>
                        <button className={s.iconBtn} onClick={() => openLocModal(nc)} disabled={b}
                          title={nc.location_full ? `위치: ${nc.location_full}` : '위치 지정'}>
                          <IconPin />
                        </button>
                        <button className={s.iconBtn} onClick={() => onPrintLabel(nc)} disabled={b} title="부적합 라벨 출력">
                          <IconPrint />
                        </button>
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
