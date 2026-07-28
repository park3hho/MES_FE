// pages/process/manage/SafetyStockPage.jsx
// 안전재고 전용 설정 화면 (2026-07-28).
//   ⚠️ 품목의 다른 속성(재질·규격·타입별 스펙…)은 여기서 건드리지 않는다 — 임계값 조정과
//     현재고 대조에만 집중. 품목 마스터(ItemManagePage)의 안전재고 칸은 그대로 두되,
//     일상적인 재고 임계값 관리는 이 화면에서 하는 것이 편하다는 요구에서 분리 (사용자 요청).
//   현재고 = 창고 '생산(PROD)' 용도 수량 합 (예비/기타 제외) — 매일 07:00 알림 메일과 같은 기준.
//   권한: 창고 라우터와 동일(로그인) — 품목 마스터 편집권(ADMIN_BOM) 없이도 임계값만 조정 가능.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { getSafetyStockList, setSafetyStock, searchWarehouseItems } from '@/api'
import styles from './SafetyStockPage.module.css'

// 정수면 소수점 없이 (자석 ea 기본), 소수면 그대로 — BE _fmt_qty 와 같은 표기
const fmt = (v) => {
  const n = Number(v ?? 0)
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)))
}

export default function SafetyStockPage() {
  const nav = useNavigate()
  const [rows, setRows] = useState([])
  const [drafts, setDrafts] = useState({})    // {item_id: 입력중인 값} — 원본과 다를 때만 저장 활성
  const [msg, setMsg] = useState(null)        // {type:'ok'|'err', text}
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await getSafetyStockList()
      setRows(r.rows || [])
      setDrafts({})
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '불러오기 실패' })
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const shortageCount = rows.filter((r) => r.deficit > 0).length

  const doSave = async (row) => {
    const raw = drafts[row.item_id]
    const v = Number(raw)
    if (raw === '' || raw == null || Number.isNaN(v)) {
      setMsg({ type: 'err', text: '안전재고 값을 숫자로 입력해주세요.' })
      return
    }
    if (v < 0) { setMsg({ type: 'err', text: '안전재고는 0 이상으로 입력해주세요.' }); return }
    setBusy(true)
    try {
      const r = await setSafetyStock(row.item_id, v)
      // 응답이 곧 갱신된 행 (현재고·부족분 재계산 포함) — 전체 재조회 없이 그 행만 교체
      setRows((prev) => prev.map((x) => (x.item_id === row.item_id ? { ...x, ...r } : x)))
      setDrafts((d) => { const n = { ...d }; delete n[row.item_id]; return n })
      setMsg({ type: 'ok', text: `${row.name} 안전재고 ${fmt(v)}${row.unit} 저장됨` })
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '저장 실패' })
    } finally { setBusy(false) }
  }

  const doRemove = async (row) => {
    if (!window.confirm(`${row.name} 을(를) 안전재고 감시에서 제외할까요?\n제외하면 부족해도 알림이 가지 않습니다.`)) return
    setBusy(true)
    try {
      await setSafetyStock(row.item_id, null)
      setRows((prev) => prev.filter((x) => x.item_id !== row.item_id))
      setMsg({ type: 'ok', text: `${row.name} 감시 해제됨` })
    } catch (e) {
      setMsg({ type: 'err', text: e.message || '해제 실패' })
    } finally { setBusy(false) }
  }

  return (
    <div className="page-flat">
      <PageHeader
        title="안전재고 설정"
        subtitle="품목별 안전재고 기준과 현재 재고 대조 — 미달 시 알림 메일 발송"
        onBack={() => nav('/admin/manage')}
      />
      <div className="page-content">
        {msg && (
          <p className={`${styles.msg} ${msg.type === 'err' ? styles.msgErr : styles.msgOk}`}>
            {msg.text}
          </p>
        )}

        <div className={styles.summary}>
          <span>
            감시 품목 <b className={styles.summaryNum}>{rows.length}</b>건
          </span>
          <span>
            부족{' '}
            <b className={`${styles.summaryNum} ${shortageCount ? styles.shortage : styles.ok}`}>
              {shortageCount}
            </b>
            건
          </span>
        </div>
        <p className={styles.hint}>
          ※ 현재고는 창고 <b>생산</b> 용도 수량의 합입니다 (예비·기타 용도 제외).
          부족 품목이 있으면 매일 07:00 에 알림 메일이 발송됩니다 — 수신자는 <b>알림 발송 설정</b> 에서 지정합니다.
        </p>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>품목</th>
                <th>규격</th>
                <th className={styles.num}>현재고</th>
                <th className={styles.num}>안전재고</th>
                <th>상태</th>
                <th aria-label="작업" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const draft = drafts[r.item_id]
                const dirty = draft !== undefined && String(draft) !== String(r.safety_stock)
                return (
                  <tr key={r.item_id}>
                    <td>
                      <div>{r.name}</div>
                      <div className={styles.partNo}>{r.part_no}</div>
                    </td>
                    <td>{r.spec || '-'}</td>
                    <td className={styles.num}>{fmt(r.current)}{r.unit}</td>
                    <td className={styles.num}>
                      <input
                        className={styles.qtyInput}
                        type="number"
                        min="0"
                        step="any"
                        disabled={busy}
                        value={draft !== undefined ? draft : r.safety_stock}
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.item_id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter' && dirty) doSave(r) }}
                      />
                      {' '}{r.unit}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${r.deficit > 0 ? styles.shortage : styles.ok}`}>
                        {r.deficit > 0 ? `⚠ 부족 ${fmt(r.deficit)}${r.unit}` : `여유 ${fmt(-r.deficit)}${r.unit}`}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn-primary btn-sm"
                        disabled={busy || !dirty} onClick={() => doSave(r)}>
                        저장
                      </button>
                      {' '}
                      <button type="button" className="btn-text"
                        disabled={busy} onClick={() => doRemove(r)}>
                        감시 해제
                      </button>
                    </td>
                  </tr>
                )
              })}
              {loaded && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    감시 중인 품목이 없습니다 — 아래에서 품목을 찾아 안전재고를 지정해주세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <AddWatchItem
          busy={busy}
          watchedIds={rows.map((r) => r.item_id)}
          onAdded={(row) => {
            setRows((prev) => [...prev, row].sort((a, b) => b.deficit - a.deficit))
            setMsg({ type: 'ok', text: `${row.name} 감시 대상에 추가됨` })
          }}
          onError={(text) => setMsg({ type: 'err', text })}
        />
      </div>
    </div>
  )
}


// ── 감시 대상 추가 — 품목 검색 후 안전재고 지정 ──
// 검색은 창고 입고 wizard 와 같은 경량 API (로그인만, 품목 마스터 권한 불요)
function AddWatchItem({ busy, watchedIds, onAdded, onError }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)   // null = 검색 전
  const [searching, setSearching] = useState(false)
  const [qty, setQty] = useState({})             // {item_id: 입력값}

  const doSearch = async () => {
    const kw = q.trim()
    if (!kw) return
    setSearching(true)
    try {
      setResults(await searchWarehouseItems(kw))
    } catch (e) {
      onError(e.message || '검색 실패')
    } finally { setSearching(false) }
  }

  const doAdd = async (it) => {
    const v = Number(qty[it.id])
    if (qty[it.id] == null || qty[it.id] === '' || Number.isNaN(v) || v < 0) {
      onError('안전재고 값을 0 이상 숫자로 입력해주세요.')
      return
    }
    try {
      const r = await setSafetyStock(it.id, v)
      onAdded(r)
      setQty((s) => { const n = { ...s }; delete n[it.id]; return n })
    } catch (e) {
      onError(e.message || '추가 실패')
    }
  }

  return (
    <section className={styles.addBox}>
      <h3 style={{ margin: '0 0 10px' }}>감시 대상 추가</h3>
      <div className={styles.addRow}>
        <input
          className={styles.searchInput}
          value={q}
          placeholder="품번 또는 품목명 검색"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
        />
        <button type="button" className="btn-secondary btn-sm" disabled={searching} onClick={doSearch}>
          {searching ? '검색 중…' : '검색'}
        </button>
      </div>

      {results && results.length === 0 && (
        <p className={styles.hint} style={{ marginTop: 10 }}>검색 결과가 없습니다.</p>
      )}

      {results && results.length > 0 && (
        <ul className={styles.results}>
          {results.map((it) => {
            const already = watchedIds.includes(it.id)
            return (
              <li key={it.id} className={styles.resultItem}>
                <span className={styles.grow}>
                  {it.name || it.part_no}
                  <span className={styles.partNo}> · {it.part_no}{it.spec ? ` · ${it.spec}` : ''}</span>
                </span>
                {already ? (
                  <span className={styles.watched}>이미 감시 중</span>
                ) : (
                  <>
                    <input
                      className={styles.qtyInput}
                      type="number"
                      min="0"
                      step="any"
                      placeholder="기준"
                      value={qty[it.id] ?? ''}
                      onChange={(e) => setQty((s) => ({ ...s, [it.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') doAdd(it) }}
                    />
                    <span className={styles.watched}>{it.unit || 'EA'}</span>
                    <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => doAdd(it)}>
                      추가
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
