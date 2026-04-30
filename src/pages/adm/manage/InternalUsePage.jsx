// pages/adm/manage/InternalUsePage.jsx
// 사내 사용 재고 관리 — team_rnd 전용 (2026-04-30)
//
// 기능:
//   - 목록 조회 (process 필터 + lot_no 검색)
//   - 메모 수정 (inline 편집)
//   - 해제 (internal_use → in_stock)
// 추가(마킹)는 다른 페이지에서 처리 — 이 페이지엔 추가 UI 없음.

import { useState, useEffect, useCallback } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { getInternalUseList, updateInternalMemo, releaseInternalUse } from '@/api'
import { PROCESS_LIST } from '@/constants/processConst'

// 공정 코드 옵션 — 셀렉트용 (전체 + 모든 공정)
const PROCESS_OPTIONS = [
  { code: '', name: '전체 공정' },
  ...PROCESS_LIST,
]

const fmtDate = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

export default function InternalUsePage({ onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 필터 상태
  const [process, setProcess] = useState('')
  const [search, setSearch] = useState('')

  // 메모 inline 편집 — { [lot_no]: 'editing memo text' }
  const [editingMemo, setEditingMemo] = useState({})
  const [savingLot, setSavingLot] = useState('')

  // 해제 확인 — { lot_no: '확인 중인 lot' } 또는 ''
  const [confirmRelease, setConfirmRelease] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getInternalUseList({ process, search })
      setItems(data.items || [])
    } catch (e) {
      setError(e.message || '목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [process, search])

  // 필터/검색 변경 시 자동 reload (debounce 0.4s)
  useEffect(() => {
    const t = setTimeout(reload, 400)
    return () => clearTimeout(t)
  }, [reload])

  const handleStartEdit = (lotNo, currentMemo) => {
    setEditingMemo((m) => ({ ...m, [lotNo]: currentMemo || '' }))
  }
  const handleCancelEdit = (lotNo) => {
    setEditingMemo((m) => {
      const next = { ...m }
      delete next[lotNo]
      return next
    })
  }
  const handleSaveMemo = async (lotNo) => {
    const newMemo = editingMemo[lotNo] ?? ''
    setSavingLot(lotNo)
    try {
      const r = await updateInternalMemo(lotNo, newMemo)
      // 응답 item 으로 갱신
      setItems((arr) => arr.map((it) => (it.lot_no === lotNo ? r.item : it)))
      handleCancelEdit(lotNo)
    } catch (e) {
      setError(e.message || '메모 수정 실패')
    } finally {
      setSavingLot('')
    }
  }

  const handleRelease = async (lotNo) => {
    setSavingLot(lotNo)
    try {
      await releaseInternalUse(lotNo)
      setItems((arr) => arr.filter((it) => it.lot_no !== lotNo))
      setConfirmRelease('')
    } catch (e) {
      setError(e.message || '해제 실패')
    } finally {
      setSavingLot('')
    }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="사내 사용 재고"
        subtitle="회사 내부에서 사용 중인 LOT 목록 (team_rnd 전용)"
        onBack={onBack}
      />

      {/* 필터 / 검색 */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center',
        padding: '12px 16px', borderBottom: '1px solid var(--color-list-divider, #f0f2f6)',
      }}>
        <select
          value={process}
          onChange={(e) => setProcess(e.target.value)}
          className="form-input"
          style={{ width: 160, height: 40, fontSize: 14 }}
        >
          {PROCESS_OPTIONS.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code ? `${p.code} · ${p.name}` : p.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="LOT 번호 검색"
          className="form-input"
          style={{ flex: 1, height: 40, fontSize: 14 }}
        />
        <span style={{ fontSize: 13, color: 'var(--color-text-sub, #5f6b7a)' }}>
          {loading ? '불러오는 중…' : `${items.length}건`}
        </span>
      </div>

      {error && (
        <div style={{
          margin: '12px 16px', padding: '8px 12px',
          background: '#fef2f2', color: '#b91c1c', fontSize: 13, borderRadius: 8,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* 리스트 */}
      <div>
        {!loading && items.length === 0 && !error && (
          <div style={{
            padding: '40px 16px', textAlign: 'center',
            color: 'var(--color-text-sub, #5f6b7a)', fontSize: 14,
          }}>
            사내 사용 처리된 재고가 없습니다.
          </div>
        )}

        {items.map((it) => {
          const editing = it.lot_no in editingMemo
          const saving = savingLot === it.lot_no
          return (
            <div
              key={`${it.process}-${it.lot_no}-${it.id}`}
              className="list-item"
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 60px 1fr 130px auto',
                gap: 12, alignItems: 'center',
                padding: '14px 16px',
                borderBottom: '1px solid var(--color-list-divider, #f0f2f6)',
              }}
            >
              {/* 1. lot_no + meta */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{it.lot_no}</div>
                {(it.group_key || it.motor_type) && (
                  <div style={{ fontSize: 11, color: 'var(--color-text-sub, #5f6b7a)', marginTop: 2 }}>
                    {it.group_key && `Φ${it.group_key}`}
                    {it.group_key && it.motor_type && ' · '}
                    {it.motor_type === 'inner' ? 'Inner' : it.motor_type === 'outer' ? 'Outer' : it.motor_type}
                  </div>
                )}
              </div>

              {/* 2. 공정 칩 */}
              <span style={{
                fontSize: 11, fontWeight: 700,
                padding: '4px 8px', borderRadius: 999,
                background: '#eef1f8', color: '#3b4252',
                textAlign: 'center',
              }}>
                {it.process}
              </span>

              {/* 3. 메모 (inline 편집) */}
              <div>
                {editing ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={editingMemo[it.lot_no]}
                      onChange={(e) => setEditingMemo((m) => ({ ...m, [it.lot_no]: e.target.value }))}
                      placeholder="메모 (사유 / 용도)"
                      maxLength={200}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveMemo(it.lot_no)
                        if (e.key === 'Escape') handleCancelEdit(it.lot_no)
                      }}
                      className="form-input"
                      style={{ flex: 1, height: 32, fontSize: 13 }}
                    />
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => handleSaveMemo(it.lot_no)}
                      disabled={saving}
                    >
                      {saving ? '저장…' : '저장'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => handleCancelEdit(it.lot_no)}
                      disabled={saving}
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartEdit(it.lot_no, it.internal_memo)}
                    title="메모 수정"
                    style={{
                      background: 'none', border: '1px dashed transparent',
                      padding: '6px 8px', borderRadius: 6, textAlign: 'left',
                      fontSize: 13,
                      color: it.internal_memo ? 'inherit' : 'var(--color-text-sub, #9aa3b3)',
                      width: '100%', cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-list-divider, #f0f2f6)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent' }}
                  >
                    {it.internal_memo || '메모 없음 — 클릭하여 입력'}
                  </button>
                )}
              </div>

              {/* 4. 처리 시각 */}
              <div style={{ fontSize: 11, color: 'var(--color-text-sub, #5f6b7a)' }}>
                {fmtDate(it.updated_at)}
              </div>

              {/* 5. 해제 버튼 */}
              <div>
                {confirmRelease === it.lot_no ? (
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn-danger btn-sm"
                      onClick={() => handleRelease(it.lot_no)}
                      disabled={saving}
                    >
                      {saving ? '해제…' : '확정'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => setConfirmRelease('')}
                      disabled={saving}
                    >
                      취소
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => setConfirmRelease(it.lot_no)}
                    disabled={editing || saving}
                    title="in_stock 으로 복원"
                  >
                    해제
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
