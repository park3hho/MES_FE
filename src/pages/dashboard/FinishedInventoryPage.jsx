// 완제품 재고 페이지 — BottomNav '재고' 탭의 finished 뷰
// 2개 세그먼트: 완제품 현황 (ST+RT 통합) / 박스 현황
// 통합 현황: 모델별(phi+motor) × 위치별(자유/UB만/MB) 카운트 + ST/RT 자유재고 리스트 (2026-05-08)

import { useMemo, useState, useEffect } from 'react'

import {
  getFinishedProducts, getBoxSummaryAll, getStockOverview,
  getRotorStocks, createRotorStocksBulk, reprintRotorLabel, printFinalLabel,
} from '@/api'
import { BoxAccordionGroup } from '@/components/Inventory/BoxSection'
import { PHI_SPECS } from '@/constants/processConst'
import { useModels } from '@/hooks/useModels'
import { useToast } from '@/contexts/ToastContext'

import s from './FinishedInventoryPage.module.css'

const SEGMENTS = [
  { key: 'product', label: '완제품 현황' },
  { key: 'box', label: '박스 현황' },
]

// motor_type 라벨 (DB motor_type 코드는 'outer'/'inner' 로 고정)
const MOTOR_LABELS = { outer: 'O (외전)', inner: 'I (내전)' }
const MOTOR_SHORT = { outer: 'O', inner: 'I' }

// ════════════════════════════════════════════
// 통합 현황 섹션 — ST + RT 모델별 × 위치별 카운트
// ════════════════════════════════════════════
function ProductSection() {
  const toast = useToast()
  const { models, findModel } = useModels()
  const phiColor = (phi, motor) =>
    findModel(phi, motor)?.color_hex ??
    findModel(phi, 'inner')?.color_hex ??
    findModel(phi, 'outer')?.color_hex ??
    PHI_SPECS[phi]?.color ??
    '#ccc'

  // ── 데이터 로드 ────────────────────────────────
  const [overview, setOverview] = useState(null)        // {total, models[]}
  const [stItems, setStItems] = useState([])            // 자유 재고 ST (검사정보 포함)
  const [rtItems, setRtItems] = useState([])            // 자유 재고 RT
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── 필터/UI 상태 ────────────────────────────────
  const [filterKey, setFilterKey] = useState('')        // '' | `${phi}_${motor}`
  // 리스트 펼침 상태 — 기본 접힘 (요약 우선 노출)
  const [showStList, setShowStList] = useState(false)
  const [showRtList, setShowRtList] = useState(false)

  const fetchAll = async () => {
    try {
      const [ov, fp, rt] = await Promise.all([
        getStockOverview(), getFinishedProducts(), getRotorStocks(),
      ])
      setOverview(ov)
      setStItems(fp.items || [])
      setRtItems(Array.isArray(rt) ? rt : [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  // ── RT 추가 폼 ────────────────────────────────
  const motorOptionsByPhi = useMemo(() => {
    const m = {}
    for (const mod of models) {
      if (!mod.is_active) continue
      if (!m[mod.phi]) m[mod.phi] = new Set()
      m[mod.phi].add(mod.motor_type)
    }
    return Object.fromEntries(Object.entries(m).map(([phi, set]) => [phi, Array.from(set)]))
  }, [models])

  const [showRtForm, setShowRtForm] = useState(false)
  const [rtForm, setRtForm] = useState({ phi: '', motor_type: 'outer', count: 1 })
  const [saving, setSaving] = useState(false)
  const [lastRtResult, setLastRtResult] = useState(null)

  const resetRtForm = () => {
    setRtForm({ phi: '', motor_type: 'outer', count: 1 })
    setLastRtResult(null)
  }

  const handleCreateRt = async () => {
    if (!rtForm.phi) { toast('파이를 선택해주세요.', 'warn'); return }
    const count = parseInt(rtForm.count) || 1
    if (count < 1) { toast('수량은 1 이상이어야 합니다.', 'warn'); return }
    setSaving(true)
    try {
      const res = await createRotorStocksBulk({
        phi: rtForm.phi, motor_type: rtForm.motor_type, count,
      })
      setLastRtResult(res)
      await fetchAll()
    } catch (e) {
      toast(`저장 실패: ${e.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── RT 재인쇄 ────────────────────────────────
  const [reprinting, setReprinting] = useState(null)
  const handleReprint = async (row) => {
    if (reprinting) return
    setReprinting(row.lot_no)
    try {
      await reprintRotorLabel(row.lot_no)
    } catch (e) {
      toast(`재인쇄 실패: ${e.message}`, 'error')
    } finally {
      setReprinting(null)
    }
  }

  // ── 출하 시리얼 스티커(final label) 재출력 — 2026-06-16 ──
  const [stickerPrinting, setStickerPrinting] = useState(null)
  const handleFinalLabel = async (row) => {
    if (stickerPrinting) return
    setStickerPrinting(row.lot_no)
    try {
      await printFinalLabel(row.lot_no)
    } catch (e) {
      toast(`스티커 출력 실패: ${e.message}`, 'error')
    } finally {
      setStickerPrinting(null)
    }
  }

  if (loading) return <p className={s.info}>로딩 중...</p>
  if (error) return <p className={s.error}>{error}</p>

  const modelRows = overview?.models || []
  const totalSt = overview?.total?.st ?? 0
  const totalRt = overview?.total?.rt ?? 0

  // 필터링된 리스트
  const filtered = (rows, getPhi, getMotor) => {
    if (!filterKey) return rows
    const [fp, fm] = filterKey.split('_')
    return rows.filter((r) => getPhi(r) === fp && getMotor(r) === fm)
  }
  const filteredSt = filtered(stItems, (r) => r.phi, (r) => r.motor_type || 'unknown')
  const filteredRt = filtered(rtItems, (r) => r.phi, (r) => r.motor_type || 'unknown')

  return (
    <>
      {/* ── 전체 합계 카드 ── */}
      <div className={s.summaryRow}>
        <div className={`${s.summaryCard} ${!filterKey ? s.summaryActive : ''}`}
          onClick={() => setFilterKey('')}
          style={{ cursor: 'pointer' }}>
          <span className={s.summaryCount}>{totalSt + totalRt}</span>
          <span className={s.summaryLabel}>전체</span>
        </div>
        <div className={s.summaryCard} style={{ cursor: 'default' }}>
          <span className={s.summaryCount}>{totalSt}</span>
          <span className={s.summaryLabel}>ST 합계</span>
        </div>
        <div className={s.summaryCard} style={{ cursor: 'default' }}>
          <span className={s.summaryCount}>{totalRt}</span>
          <span className={s.summaryLabel}>RT 합계</span>
        </div>
      </div>

      {/* ── 모델별 통합 테이블 ── */}
      {modelRows.length === 0 ? (
        <p className={s.info}>등록된 재고가 없어요.</p>
      ) : (
        <div className={s.overviewWrap}>
          <table className={s.overviewTable}>
            <thead>
              <tr>
                <th rowSpan={2} className={s.modelCol}>모델</th>
                <th colSpan={4} className={s.stHead}>ST (스테이터)</th>
                <th colSpan={4} className={s.rtHead}>RT (로터)</th>
              </tr>
              <tr>
                <th className={s.stHead}>총</th>
                <th className={s.subHead}>자유</th>
                <th className={s.subHead}>UB만</th>
                <th className={s.subHead}>MB</th>
                <th className={s.rtHead}>총</th>
                <th className={s.subHead}>자유</th>
                <th className={s.subHead}>UB만</th>
                <th className={s.subHead}>MB</th>
              </tr>
            </thead>
            <tbody>
              {modelRows.map((m) => {
                const key = `${m.phi}_${m.motor}`
                const active = filterKey === key
                const c = phiColor(m.phi, m.motor)
                return (
                  <tr key={key}
                    className={active ? s.rowActive : ''}
                    onClick={() => setFilterKey(active ? '' : key)}
                    style={{ cursor: 'pointer' }}>
                    <td className={s.modelCol}>
                      <span className={s.phiBadge} style={{ background: c }}>
                        Φ{m.phi}-{MOTOR_SHORT[m.motor] || '?'}
                      </span>
                    </td>
                    <td className={s.numStrong}>{m.st.total}</td>
                    <td className={s.num}>{m.st.free}</td>
                    <td className={s.num}>{m.st.in_ub}</td>
                    <td className={s.num}>{m.st.in_mb}</td>
                    <td className={s.numStrong}>{m.rt.total}</td>
                    <td className={s.num}>{m.rt.free}</td>
                    <td className={s.num}>{m.rt.in_ub}</td>
                    <td className={s.num}>{m.rt.in_mb}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filterKey && (
            <p className={s.filterHint}>
              모델 필터 적용 중 — 행을 다시 클릭하면 해제됩니다.
            </p>
          )}
        </div>
      )}

      {/* ── ST 자유 재고 리스트 (펼침) ── */}
      <div className={s.detailBlock}>
        <button type="button" className={s.detailToggle}
          onClick={() => setShowStList((v) => !v)}>
          <span>{showStList ? '▾' : '▸'}</span>
          ST 자유 재고 ({filteredSt.length}개)
        </button>
        {showStList && (
          <StFreeList items={filteredSt} phiColor={phiColor} />
        )}
      </div>

      {/* ── RT 자유 재고 리스트 + 추가 폼 (펼침) ── */}
      <div className={s.detailBlock}>
        <button type="button" className={s.detailToggle}
          onClick={() => setShowRtList((v) => !v)}>
          <span>{showRtList ? '▾' : '▸'}</span>
          RT 자유 재고 ({filteredRt.length}개)
        </button>
        {showRtList && (
          <>
            {!showRtForm ? (
              <button type="button" className="btn-primary btn-md"
                style={{ marginBottom: 12 }}
                onClick={() => setShowRtForm(true)}>
                + RT 재고 추가
              </button>
            ) : (
              <RtAddForm
                form={rtForm} setForm={setRtForm}
                motorOptionsByPhi={motorOptionsByPhi}
                phiColor={phiColor}
                lastResult={lastRtResult}
                saving={saving}
                onCreate={handleCreateRt}
                onClose={() => { resetRtForm(); setShowRtForm(false) }}
              />
            )}
            <RtFreeList items={filteredRt} phiColor={phiColor}
              reprinting={reprinting} onReprint={handleReprint}
              stickerPrinting={stickerPrinting} onFinalLabel={handleFinalLabel} />
          </>
        )}
      </div>
    </>
  )
}

// ────────────────────────────────────────────
// ST 자유 재고 리스트 (기존 STSection 의 테이블/카드)
// ────────────────────────────────────────────
function StFreeList({ items, phiColor }) {
  if (items.length === 0) {
    return <p className={s.info}>해당 모델의 자유 재고 ST 가 없어요.</p>
  }
  return (
    <>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>시리얼</th><th>OQ LOT</th><th>SO LOT</th>
              <th>Φ</th><th>Motor</th><th>Wire</th>
              <th>R (Ω)</th><th>L</th><th>검사일</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.lot_fp_no}>
                <td className={s.mono}>{r.serial_no}</td>
                <td className={s.mono}>{r.lot_fp_no}</td>
                <td className={s.mono}>{r.lot_so_no || '-'}</td>
                <td>
                  <span className={s.phiBadge} style={{ background: phiColor(r.phi, r.motor_type) }}>Φ{r.phi}</span>
                </td>
                <td>{r.motor_type || '-'}</td>
                <td>{r.wire_type}</td>
                <td>{r.resistance ?? '-'}</td>
                <td>{r.inductance ?? '-'}</td>
                <td className={s.dateCell}>
                  {r.created_at ? r.created_at.replace('T', ' ').slice(0, 16) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.cardList}>
        {items.map((r) => (
          <div key={r.lot_fp_no} className={s.listCard}>
            <div className={s.cardTop}>
              <span className={s.cardSerial}>{r.serial_no}</span>
              <div className={s.cardBadges}>
                <span className={s.phiBadge} style={{ background: phiColor(r.phi, r.motor_type) }}>Φ{r.phi}</span>
                {r.motor_type && <span className={s.cardMotor}>{r.motor_type}</span>}
              </div>
            </div>
            <div className={s.cardMid}>{r.lot_fp_no} · {r.lot_so_no || '-'} · {r.wire_type}</div>
            <div className={s.cardGrid}>
              <span>R: {r.resistance ?? '-'}</span>
              <span>L: {r.inductance ?? '-'}</span>
            </div>
            <div className={s.cardDate}>
              {r.created_at ? r.created_at.replace('T', ' ').slice(0, 16) : '-'}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ────────────────────────────────────────────
// RT 자유 재고 리스트 (기존 RTSection 의 테이블)
// ────────────────────────────────────────────
function RtFreeList({ items, phiColor, reprinting, onReprint, stickerPrinting, onFinalLabel }) {
  if (items.length === 0) {
    return <p className={s.info}>해당 모델의 자유 재고 RT 가 없어요.</p>
  }
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>LOT</th><th>Φ</th><th>Motor</th><th>수량</th><th>등록일</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td className={s.mono}>{r.lot_no}</td>
              <td>
                <span className={s.phiBadge} style={{ background: phiColor(r.phi, r.motor_type) }}>Φ{r.phi}</span>
              </td>
              <td>{MOTOR_LABELS[r.motor_type] || r.motor_type}</td>
              <td style={{ textAlign: 'center' }}>{r.quantity}</td>
              <td className={s.dateCell}>
                {r.created_at ? r.created_at.replace('T', ' ').slice(0, 16) : '-'}
              </td>
              <td style={{ display: 'flex', gap: 6 }}>
                <button type="button"
                  onClick={() => onReprint(r)}
                  disabled={reprinting === r.lot_no}
                  style={{
                    background: 'none',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    padding: '4px 10px',
                    color: 'var(--color-primary)',
                    cursor: reprinting === r.lot_no ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 600,
                  }}>
                  {reprinting === r.lot_no ? '인쇄 중...' : '재인쇄'}
                </button>
                <button type="button"
                  onClick={() => onFinalLabel(r)}
                  disabled={stickerPrinting === r.lot_no}
                  title="출하 시리얼 스티커(final label) 재출력"
                  style={{
                    background: 'none',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    padding: '4px 10px',
                    color: 'var(--color-primary)',
                    cursor: stickerPrinting === r.lot_no ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 600,
                  }}>
                  {stickerPrinting === r.lot_no ? '인쇄 중...' : '스티커'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ────────────────────────────────────────────
// RT 추가 폼 (기존 RTSection 의 폼)
// ────────────────────────────────────────────
function RtAddForm({ form, setForm, motorOptionsByPhi, phiColor, lastResult, saving, onCreate, onClose }) {
  return (
    <div style={{ background: 'var(--color-bg)', padding: 16, borderRadius: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
        LOT 번호는 자동 채번됩니다 (RT{form.phi || '?'}-YYYYMMDD-001 …)
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>파이</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.keys(PHI_SPECS).map((phi) => {
            const c = phiColor(phi, form.motor_type)
            return (
              <button key={phi} type="button"
                onClick={() => {
                  const opts = motorOptionsByPhi[phi] || []
                  const nextMotor = opts.includes(form.motor_type) ? form.motor_type : (opts[0] || form.motor_type)
                  setForm({ ...form, phi, motor_type: nextMotor })
                }}
                style={{
                  padding: '8px 14px', borderRadius: 8,
                  border: form.phi === phi ? `2px solid ${c}` : '1px solid var(--color-border)',
                  background: form.phi === phi ? c : '#fff',
                  color: form.phi === phi ? '#fff' : 'var(--color-dark)',
                  fontWeight: 700, cursor: 'pointer',
                }}>
                Φ{phi}
              </button>
            )
          })}
        </div>
      </div>
      {(() => {
        const opts = form.phi ? (motorOptionsByPhi[form.phi] || []) : []
        if (opts.length < 2) return null
        return (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>모터 타입</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {opts.map((value) => (
                <button key={value} type="button"
                  onClick={() => setForm({ ...form, motor_type: value })}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8,
                    border: form.motor_type === value ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: form.motor_type === value ? 'var(--color-primary)' : '#fff',
                    color: form.motor_type === value ? '#fff' : 'var(--color-dark)',
                    fontWeight: 700, cursor: 'pointer',
                  }}>
                  {MOTOR_LABELS[value] || value}
                </button>
              ))}
            </div>
          </div>
        )
      })()}
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>수량 (몇 개 생산했나요?)</label>
        <input className="form-input" type="number" min={1} max={500}
          value={form.count}
          onChange={(e) => setForm({ ...form, count: e.target.value })}
          style={{ width: '100%' }} />
      </div>
      {lastResult && (
        <div style={{ background: '#e8f5ec', padding: 10, borderRadius: 8, fontSize: 12, color: '#2c6939' }}>
          ✓ {lastResult.count}개 생성 · 인쇄 {lastResult.printed ?? lastResult.count}장
          <div style={{ marginTop: 4, fontFamily: 'monospace', color: '#3d7a4a' }}>
            {lastResult.items?.[0]?.lot_no} ~ {lastResult.items?.[lastResult.items.length - 1]?.lot_no}
          </div>
          {lastResult.print_errors?.length > 0 && (
            <div style={{ marginTop: 6, color: '#c0392b', fontSize: 11 }}>
              ⚠ 인쇄 실패 {lastResult.print_errors.length}건 — 목록에서 재인쇄 가능
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn-primary btn-md"
          onClick={onCreate} disabled={saving}
          style={{ flex: 1 }}>
          {saving ? '저장 중...' : '저장 (자동 채번)'}
        </button>
        <button type="button" className="btn-secondary btn-md"
          onClick={onClose} style={{ flex: 1 }}>
          닫기
        </button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
// 박스 섹션 — UB/MB 아코디언
// ════════════════════════════════════════════
function BoxSection() {
  const [ubBoxes, setUbBoxes] = useState([])
  const [mbBoxes, setMbBoxes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const d = await getBoxSummaryAll()
        setUbBoxes(d?.ub || [])
        setMbBoxes(d?.mb || [])
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <p className={s.info}>로딩 중...</p>
  if (error) return <p className={s.error}>{error}</p>

  // BE에서 이미 정렬됨 (UB: phi+date / MB: date) — 단순 분리만 (2026-04-18)
  const ubFilled = ubBoxes.filter((b) => !b.empty)
  const ubEmpty = ubBoxes.filter((b) => b.empty)
  const mbFilled = mbBoxes.filter((b) => !b.empty)
  const mbEmpty = mbBoxes.filter((b) => b.empty)

  return (
    <div className={s.boxSection}>
      <div>
        <p className={s.boxSectionTitle}>UB (Unit Box)</p>
        <BoxAccordionGroup label="사용 중" boxes={ubFilled} process="UB" visible defaultOpen />
        <BoxAccordionGroup label="빈 박스" boxes={ubEmpty} process="UB" visible defaultOpen={false} />
      </div>
      <div>
        <p className={s.boxSectionTitle}>MB (Master Box)</p>
        <BoxAccordionGroup label="사용 중" boxes={mbFilled} process="MB" visible defaultOpen />
        <BoxAccordionGroup label="빈 박스" boxes={mbEmpty} process="MB" visible defaultOpen={false} />
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
// 메인 페이지
// ════════════════════════════════════════════
export default function FinishedInventoryPage({ onLogout }) {
  // 기존 'st'/'rt' 값은 통합 'product' 로 마이그레이션 (2026-05-08)
  const [segment, setSegment] = useState(() => {
    const saved = localStorage.getItem('finishedInvSegment') || 'product'
    return (saved === 'st' || saved === 'rt') ? 'product' : saved
  })

  const handleSeg = (key) => {
    setSegment(key)
    try { localStorage.setItem('finishedInvSegment', key) } catch { /* */ }
  }

  return (
    <div className={s.page}>
      <div className={s.container}>
        <div className={s.header}>
          <div className={s.headerLeft}>
            <div>
              <p className={s.title}>완제품 재고</p>
              <p className={s.sub}>
                {segment === 'product' && 'ST + RT 모델별 × 위치별 재고'}
                {segment === 'box' && 'UB / MB 박스 상태'}
              </p>
            </div>
          </div>
        </div>

        <div className={s.segmentTabs}>
          {SEGMENTS.map(({ key, label }) => (
            <button key={key} type="button"
              className={`${s.segTab} ${segment === key ? s.segTabOn : ''}`}
              onClick={() => handleSeg(key)}>
              {label}
            </button>
          ))}
        </div>

        {segment === 'product' && <ProductSection />}
        {segment === 'box' && <BoxSection />}
      </div>
    </div>
  )
}
