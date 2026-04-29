// 완제품 재고 페이지 — BottomNav '재고' 탭의 finished 뷰
// 3개 세그먼트: ST 완제품 / RT 완제품 / 박스 현황
// ST 섹션은 기존 FinishedProductPage 로직 흡수

import { useMemo, useState, useEffect } from 'react'

import {
  getFinishedProducts, getBoxSummaryAll,
  getRotorStocks, getRotorSummary, createRotorStocksBulk, reprintRotorLabel,
} from '@/api'
import { BoxAccordionGroup } from '@/components/Inventory/BoxSection'
import { PHI_SPECS } from '@/constants/processConst'
import { useModels } from '@/hooks/useModels'

import s from './FinishedInventoryPage.module.css'

// color: DB ModelRegistry 로 이관 (2026-04-24 PR-6) — 모듈 레벨 phiColor 제거, 컴포넌트 내부 resolver 사용

const SEGMENTS = [
  { key: 'st', label: '완제품 ST' },
  { key: 'rt', label: '완제품 RT' },
  { key: 'box', label: '박스 현황' },
]

// motor_type 라벨 (하드코딩 제거 불가 — DB motor_type 코드는 'outer'/'inner' 로 고정)
// 옵션 자체는 DB models 에서 도출. 라벨 매핑만 여기 유지.
const MOTOR_LABELS = { outer: 'O (외전)', inner: 'I (내전)' }

// ════════════════════════════════════════════
// ST 섹션 — 기존 FinishedProductPage 이식
// ════════════════════════════════════════════
function STSection() {
  // color: DB ModelRegistry 로 이관 (2026-04-24 PR-6)
  const { findModel } = useModels()
  const phiColor = (phi, motor) =>
    findModel(phi, motor)?.color_hex ??
    findModel(phi, 'inner')?.color_hex ??
    findModel(phi, 'outer')?.color_hex ??
    PHI_SPECS[phi]?.color ??
    '#ccc'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterPhi, setFilterPhi] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const result = await getFinishedProducts()
        setData(result)
        setError(null)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const items = data?.items || []
  const filtered = filterPhi ? items.filter((r) => r.phi === filterPhi) : items
  const summary = data?.summary || {}

  return (
    <>
      {/* 파이별 요약 카드 */}
      <div className={s.summaryRow}>
        <button
          className={`${s.summaryCard} ${!filterPhi ? s.summaryActive : ''}`}
          onClick={() => setFilterPhi('')}
        >
          <span className={s.summaryCount}>{data?.total ?? '-'}</span>
          <span className={s.summaryLabel}>전체</span>
        </button>
        {Object.entries(summary).map(([phi, count]) => (
          <button
            key={phi}
            className={`${s.summaryCard} ${filterPhi === phi ? s.summaryActive : ''}`}
            style={filterPhi === phi ? { borderColor: phiColor(phi) } : {}}
            onClick={() => setFilterPhi(filterPhi === phi ? '' : phi)}
          >
            <span className={s.phiBadge} style={{ background: phiColor(phi) }}>Φ{phi}</span>
            <span className={s.summaryCount}>{count}</span>
          </button>
        ))}
      </div>

      {loading && <p className={s.info}>로딩 중...</p>}
      {error && <p className={s.error}>{error}</p>}
      {!loading && <p className={s.info}>총 {filtered.length}개</p>}

      {/* 데스크탑 테이블 */}
      {filtered.length > 0 && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>시리얼</th>
                <th>OQ LOT</th>
                <th>SO LOT</th>
                <th>Φ</th>
                <th>Motor</th>
                <th>Wire</th>
                <th>R (Ω)</th>
                <th>L</th>
                <th>검사일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
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
      )}

      {/* 모바일 카드 리스트 */}
      {filtered.length > 0 && (
        <div className={s.cardList}>
          {filtered.map((r) => (
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
      )}
    </>
  )
}

// ════════════════════════════════════════════
// RT 섹션 — 직접 입력으로 로터 재고 관리
// ════════════════════════════════════════════
// MOTOR_OPTIONS 하드코딩 제거: DB ModelRegistry 로 이관 (2026-04-24 PR-7)

function RTSection() {
  // color / motor 옵션: DB ModelRegistry 로 이관 (2026-04-24 PR-6, PR-7)
  const { models, findModel } = useModels()
  const phiColor = (phi, motor) =>
    findModel(phi, motor)?.color_hex ??
    findModel(phi, 'inner')?.color_hex ??
    findModel(phi, 'outer')?.color_hex ??
    PHI_SPECS[phi]?.color ??
    '#ccc'

  // phi 별 motor_type 옵션 (is_active) — 신규 모델 추가 시 자동 반영
  const motorOptionsByPhi = useMemo(() => {
    const m = {}
    for (const mod of models) {
      if (!mod.is_active) continue
      if (!m[mod.phi]) m[mod.phi] = new Set()
      m[mod.phi].add(mod.motor_type)
    }
    return Object.fromEntries(
      Object.entries(m).map(([phi, set]) => [phi, Array.from(set)]),
    )
  }, [models])

  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ total: 0, summary: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  // 폼 상태 — 자동 시퀀스 채번이라 lot_no 미입력. phi/motor/count 만 (2026-04-29)
  const [form, setForm] = useState({ phi: '', motor_type: 'outer', count: 1 })
  const [saving, setSaving] = useState(false)
  const [lastResult, setLastResult] = useState(null)   // bulk 생성 결과 표시용

  const fetchAll = async () => {
    try {
      const [list, sum] = await Promise.all([getRotorStocks(), getRotorSummary()])
      setItems(list)
      setSummary(sum)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const resetForm = () => {
    setForm({ phi: '', motor_type: 'outer', count: 1 })
    setLastResult(null)
  }

  // 재인쇄 — 기존 RT 행의 라벨 한 장 다시 출력 (RotorStock 변경 X)
  const [reprinting, setReprinting] = useState(null)
  const handleReprint = async (row) => {
    if (reprinting) return
    setReprinting(row.lot_no)
    try {
      await reprintRotorLabel(row.lot_no)
    } catch (e) {
      alert(`재인쇄 실패: ${e.message}`)
    } finally {
      setReprinting(null)
    }
  }

  // bulk 생성 — phi+motor+count → 자동 시퀀스 채번해 N개 행 생성 + 라벨 N장 인쇄 (2026-04-29)
  const handleCreate = async () => {
    if (!form.phi) { alert('파이를 선택해주세요.'); return }
    const count = parseInt(form.count) || 1
    if (count < 1) { alert('수량은 1 이상이어야 합니다.'); return }
    setSaving(true)
    try {
      const res = await createRotorStocksBulk({
        phi: form.phi,
        motor_type: form.motor_type,
        count,
      })
      setLastResult(res)
      // 폼은 유지 — 같은 phi/motor 로 추가 등록 흐름 자연스럽게
      await fetchAll()
    } catch (e) {
      alert(`저장 실패: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className={s.info}>로딩 중...</p>

  return (
    <>
      {error && <p className={s.error}>{error}</p>}

      {/* 요약 카드 — phi × motor 별 수량 */}
      <div className={s.summaryRow}>
        <div className={s.summaryCard} style={{ cursor: 'default' }}>
          <span className={s.summaryCount}>{summary.total}</span>
          <span className={s.summaryLabel}>전체</span>
        </div>
        {Object.entries(summary.summary || {}).flatMap(([phi, motors]) =>
          Object.entries(motors).map(([motor, count]) => (
            <div key={`${phi}-${motor}`} className={s.summaryCard} style={{ cursor: 'default' }}>
              <span className={s.phiBadge} style={{ background: phiColor(phi, motor) }}>Φ{phi}-{motor === 'outer' ? 'O' : 'I'}</span>
              <span className={s.summaryCount}>{count}</span>
            </div>
          )),
        )}
      </div>

      {/* + 추가 버튼 또는 폼 */}
      {!showForm ? (
        <button
          type="button"
          className="btn-primary btn-md"
          style={{ marginBottom: 16 }}
          onClick={() => setShowForm(true)}
        >
          + RT 재고 추가
        </button>
      ) : (
        <div style={{ background: 'var(--color-bg)', padding: 16, borderRadius: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
            LOT 번호는 자동 채번됩니다 (RT{form.phi || '?'}-YYYYMMDD-001 …)
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>파이</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.keys(PHI_SPECS).map((phi) => {
                // color: DB ModelRegistry 로 이관 (2026-04-24 PR-6) — form.motor_type 사용
                const c = phiColor(phi, form.motor_type)
                return (
                  <button
                    key={phi}
                    type="button"
                    onClick={() => {
                      // phi 변경 시 해당 phi 의 기본 motor 자동 선택 (기존 motor_type 이 옵션에 없으면 첫 번째로)
                      const opts = motorOptionsByPhi[phi] || []
                      const nextMotor = opts.includes(form.motor_type) ? form.motor_type : (opts[0] || form.motor_type)
                      setForm({ ...form, phi, motor_type: nextMotor })
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: form.phi === phi ? `2px solid ${c}` : '1px solid var(--color-border)',
                      background: form.phi === phi ? c : '#fff',
                      color: form.phi === phi ? '#fff' : 'var(--color-dark)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Φ{phi}
                  </button>
                )
              })}
            </div>
          </div>
          {/* MOTOR_OPTIONS 하드코딩 제거: DB ModelRegistry 로 이관 (2026-04-24 PR-7) */}
          {/* motor 옵션이 2개 이상인 phi 일 때만 토글 노출, 1개면 자동 선택 + 숨김 */}
          {(() => {
            const opts = form.phi ? (motorOptionsByPhi[form.phi] || []) : []
            if (opts.length < 2) return null
            return (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>모터 타입</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {opts.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, motor_type: value })}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: 8,
                        border: form.motor_type === value ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: form.motor_type === value ? 'var(--color-primary)' : '#fff',
                        color: form.motor_type === value ? '#fff' : 'var(--color-dark)',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {MOTOR_LABELS[value] || value}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>수량 (몇 개 생산했나요?)</label>
            <input
              className="form-input"
              type="number"
              min={1}
              max={500}
              value={form.count}
              onChange={(e) => setForm({ ...form, count: e.target.value })}
              style={{ width: '100%' }}
            />
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
            <button
              type="button"
              className="btn-primary btn-md"
              onClick={handleCreate}
              disabled={saving}
              style={{ flex: 1 }}
            >
              {saving ? '저장 중...' : '저장 (자동 채번)'}
            </button>
            <button
              type="button"
              className="btn-secondary btn-md"
              onClick={() => { resetForm(); setShowForm(false) }}
              style={{ flex: 1 }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 목록 — 자동 채번 (read-only). 수정/삭제 제거 (2026-04-29) */}
      {items.length === 0 ? (
        <p className={s.info}>등록된 RT 재고가 없어요. + 버튼으로 추가하세요.</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>LOT</th>
                <th>Φ</th>
                <th>Motor</th>
                <th>수량</th>
                <th>등록일</th>
                <th></th>
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
                  <td>
                    <button
                      type="button"
                      onClick={() => handleReprint(r)}
                      disabled={reprinting === r.lot_no}
                      style={{
                        background: 'none',
                        border: '1px solid var(--color-border)',
                        borderRadius: 6,
                        padding: '4px 10px',
                        color: 'var(--color-primary)',
                        cursor: reprinting === r.lot_no ? 'not-allowed' : 'pointer',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {reprinting === r.lot_no ? '인쇄 중...' : '재인쇄'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
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
// onLogout — 하위 네비에서 사용 (현재 미사용), 탭 상태는 localStorage 영속
export default function FinishedInventoryPage({ onLogout }) {
  const [segment, setSegment] = useState(() => localStorage.getItem('finishedInvSegment') || 'st')

  const handleSeg = (key) => {
    setSegment(key)
    try { localStorage.setItem('finishedInvSegment', key) } catch { /* */ }
  }

  return (
    <div className={s.page}>
      <div className={s.container}>
        {/* 헤더 — 제목만 (BottomNav 유지하므로 뒤로가기 없음) */}
        <div className={s.header}>
          <div className={s.headerLeft}>
            <div>
              <p className={s.title}>완제품 재고</p>
              <p className={s.sub}>
                {segment === 'st' && 'OQ 검사 완료 + UB 미투입'}
                {segment === 'rt' && '로터 재고'}
                {segment === 'box' && 'UB / MB 박스 상태'}
              </p>
            </div>
          </div>
        </div>

        {/* 세그먼트 탭 */}
        <div className={s.segmentTabs}>
          {SEGMENTS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`${s.segTab} ${segment === key ? s.segTabOn : ''}`}
              onClick={() => handleSeg(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 섹션 컨텐츠 */}
        {segment === 'st' && <STSection />}
        {segment === 'rt' && <RTSection />}
        {segment === 'box' && <BoxSection />}
      </div>
    </div>
  )
}
