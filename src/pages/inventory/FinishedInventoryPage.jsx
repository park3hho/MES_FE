// 완제품 재고 페이지 — BottomNav '재고' 탭의 finished 뷰
// 3개 세그먼트: ST 완제품 / RT 완제품 / 박스 현황
// ST 섹션은 기존 FinishedProductPage 로직 흡수

import { useState, useEffect } from 'react'

import {
  getFinishedProducts, getBoxSummaryAll,
  getRotorStocks, getRotorSummary, createRotorStock, updateRotorStock, deleteRotorStock,
} from '@/api'
import { BoxAccordionGroup } from '@/components/Inventory/BoxSection'
import { PHI_SPECS } from '@/constants/processConst'

import s from './FinishedInventoryPage.module.css'

const phiColor = (phi) => PHI_SPECS[phi]?.color ?? '#ccc'

const SEGMENTS = [
  { key: 'st', label: '완제품 ST' },
  { key: 'rt', label: '완제품 RT' },
  { key: 'box', label: '박스 현황' },
]

// ════════════════════════════════════════════
// ST 섹션 — 기존 FinishedProductPage 이식
// ════════════════════════════════════════════
function STSection() {
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
                    <span className={s.phiBadge} style={{ background: phiColor(r.phi) }}>Φ{r.phi}</span>
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
                  <span className={s.phiBadge} style={{ background: phiColor(r.phi) }}>Φ{r.phi}</span>
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
const MOTOR_OPTIONS = [
  { value: 'outer', label: 'O (외전)' },
  { value: 'inner', label: 'I (내전)' },
]

function RTSection() {
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ total: 0, summary: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  // 폼 상태
  const [form, setForm] = useState({ lot_no: '', phi: '', motor_type: 'outer', quantity: 1, memo: '' })
  const [saving, setSaving] = useState(false)

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
    setForm({ lot_no: '', phi: '', motor_type: 'outer', quantity: 1, memo: '' })
  }

  const handleCreate = async () => {
    if (!form.lot_no.trim()) { alert('LOT 번호를 입력해주세요.'); return }
    if (!form.phi) { alert('파이를 선택해주세요.'); return }
    setSaving(true)
    try {
      await createRotorStock({
        lot_no: form.lot_no.trim(),
        phi: form.phi,
        motor_type: form.motor_type,
        quantity: parseInt(form.quantity) || 1,
        memo: form.memo || '',
      })
      resetForm()
      setShowForm(false)
      await fetchAll()
    } catch (e) {
      alert(`저장 실패: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row) => {
    if (!window.confirm(`RT ${row.lot_no}를 삭제하시겠습니까?`)) return
    try {
      await deleteRotorStock(row.id)
      await fetchAll()
    } catch (e) {
      alert(`삭제 실패: ${e.message}`)
    }
  }

  const handleQtyUpdate = async (row, newQty) => {
    const q = parseInt(newQty)
    if (isNaN(q) || q < 1) return
    if (q === row.quantity) return
    try {
      await updateRotorStock(row.id, { quantity: q })
      await fetchAll()
    } catch (e) {
      alert(`수정 실패: ${e.message}`)
    }
  }

  if (loading) return <p className={s.info}>로딩 중...</p>

  const phiColor = (phi) => PHI_SPECS[phi]?.color ?? '#ccc'

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
              <span className={s.phiBadge} style={{ background: phiColor(phi) }}>Φ{phi}-{motor === 'outer' ? 'O' : 'I'}</span>
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
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>LOT 번호</label>
            <input
              className="form-input"
              type="text"
              placeholder="예: RT87O-001"
              value={form.lot_no}
              onChange={(e) => setForm({ ...form, lot_no: e.target.value.toUpperCase() })}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>파이</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.keys(PHI_SPECS).map((phi) => (
                <button
                  key={phi}
                  type="button"
                  onClick={() => setForm({ ...form, phi })}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: form.phi === phi ? `2px solid ${phiColor(phi)}` : '1px solid var(--color-border)',
                    background: form.phi === phi ? phiColor(phi) : '#fff',
                    color: form.phi === phi ? '#fff' : 'var(--color-dark)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Φ{phi}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>모터 타입</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {MOTOR_OPTIONS.map(({ value, label }) => (
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
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>수량</label>
            <input
              className="form-input"
              type="number"
              min={1}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--color-text-sub)', marginBottom: 6 }}>메모/시리얼 (선택)</label>
            <input
              className="form-input"
              type="text"
              placeholder="선택 입력"
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn-primary btn-md"
              onClick={handleCreate}
              disabled={saving}
              style={{ flex: 1 }}
            >
              {saving ? '저장 중...' : '저장'}
            </button>
            <button
              type="button"
              className="btn-secondary btn-md"
              onClick={() => { resetForm(); setShowForm(false) }}
              style={{ flex: 1 }}
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
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
                <th>메모</th>
                <th>등록일</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td className={s.mono}>{r.lot_no}</td>
                  <td>
                    <span className={s.phiBadge} style={{ background: phiColor(r.phi) }}>Φ{r.phi}</span>
                  </td>
                  <td>{r.motor_type === 'outer' ? 'O (외전)' : 'I (내전)'}</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      defaultValue={r.quantity}
                      onBlur={(e) => handleQtyUpdate(r, e.target.value)}
                      style={{ width: 60, padding: 4, textAlign: 'center', border: '1px solid var(--color-border)', borderRadius: 4 }}
                    />
                  </td>
                  <td>{r.memo || '-'}</td>
                  <td className={s.dateCell}>
                    {r.created_at ? r.created_at.replace('T', ' ').slice(0, 16) : '-'}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleDelete(r)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', fontSize: 14 }}
                    >
                      삭제
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
