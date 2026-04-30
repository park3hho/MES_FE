// pages/adm/manage/CertPreviewPage.jsx
// 관리자 전용 — Cert 페이지 빠른 진입 (블랙박스 테스트 편의, 2026-04-29)
//
// 흐름:
//   GET /cert-admin/mbs → 출하된 MB 목록 + cert URL 사전 빌드
//   행 클릭 시 cert.faraday-dynamics.com/{token}#pw=... 새 탭으로 이동
//   (URL fragment #pw 는 cert FE 가 자동 인증에 사용)

import { useState, useEffect } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { getCertAdminMbs, printCertUbLabel } from '@/api'
import s from './CertPreviewPage.module.css'

export default function CertPreviewPage({ onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  // 인쇄 진행 상태 — mb_lot_no → { sent, total, error? } (2026-04-30)
  const [printing, setPrinting] = useState({})
  // UB 체크박스 선택 상태 — mb_lot_no → Set<ub_lot_no> (2026-05-01, 기본=전체 선택)
  const [selectedUbs, setSelectedUbs] = useState({})
  // UB 목록 펼침 상태 — mb_lot_no → bool (2026-05-01, 기본=접힘)
  const [expandedRows, setExpandedRows] = useState({})

  const toggleExpand = (mbLotNo) => {
    setExpandedRows((prev) => ({ ...prev, [mbLotNo]: !prev[mbLotNo] }))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    getCertAdminMbs()
      .then((data) => {
        if (!cancelled) setItems(data.items || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || '목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  // items 로드되면 모든 UB 를 기본 선택 상태로 초기화 (2026-05-01)
  useEffect(() => {
    if (items.length === 0) return
    const init = {}
    items.forEach((it) => {
      const ubs = it.ub_lot_nos || (it.ub_lot_no ? [it.ub_lot_no] : [])
      init[it.mb_lot_no] = new Set(ubs)
    })
    setSelectedUbs(init)
  }, [items])

  const toggleUb = (mbLotNo, ubLotNo) => {
    setSelectedUbs((prev) => {
      const set = new Set(prev[mbLotNo] || [])
      if (set.has(ubLotNo)) set.delete(ubLotNo)
      else set.add(ubLotNo)
      return { ...prev, [mbLotNo]: set }
    })
  }

  const toggleAllUbs = (mbLotNo, allUbs) => {
    setSelectedUbs((prev) => {
      const cur = prev[mbLotNo] || new Set()
      const allSelected = cur.size === allUbs.length
      return { ...prev, [mbLotNo]: allSelected ? new Set() : new Set(allUbs) }
    })
  }

  const filtered = filter
    ? items.filter(
        (it) =>
          it.mb_lot_no?.toLowerCase().includes(filter.toLowerCase()) ||
          it.ob_lot_no?.toLowerCase().includes(filter.toLowerCase()) ||
          it.ub_lot_no?.toLowerCase().includes(filter.toLowerCase())
      )
    : items

  // BE 가 빌드한 URL (cert.faraday-dynamics.com) 은 main DB 가리킴.
  // 현재 hostname 이 cert.* 가 아니면 (dev-lot 등) → 현재 origin + ?cert-preview 로 재작성 (2026-04-29)
  // 그래야 dev-lot.* 에서 클릭 시 dev BE / dev DB 사용.
  const rewriteForCurrentEnv = (url) => {
    if (!url) return ''
    if (typeof window === 'undefined') return url
    const host = window.location.hostname
    if (host.startsWith('cert.')) return url   // cert.* 호스트면 그대로 (main 도 prod 도)
    try {
      const u = new URL(url)
      // path + hash 가져오고, 현재 origin + ?cert-preview 추가
      const sp = new URLSearchParams(u.search)
      sp.set('cert-preview', '')
      const search = sp.toString().replace(/=$/, '').replace(/=&/g, '&')
      return `${window.location.origin}${u.pathname}?${search}${u.hash}`
    } catch {
      return url
    }
  }

  const open = (url) => {
    const rewritten = rewriteForCurrentEnv(url)
    if (!rewritten) return
    window.open(rewritten, '_blank', 'noopener,noreferrer')
  }

  // 외부 라벨 일괄 인쇄 — 체크박스로 선택한 UB 만 cert URL QR 라벨 출력 (2026-05-01)
  // BE 단건 엔드포인트(/printer/print-cert-ub)를 N번 sequentially 호출 — 프린터 큐 순서 보장
  const handlePrintLabels = async (item) => {
    const allUbs = item.ub_lot_nos || (item.ub_lot_no ? [item.ub_lot_no] : [])
    const sel = selectedUbs[item.mb_lot_no] || new Set()
    // 선택 순서 보존 — 원본 ubs 배열 순서대로 필터
    const ubs = allUbs.filter((u) => sel.has(u))
    if (ubs.length === 0) return
    const key = item.mb_lot_no
    setPrinting((p) => ({ ...p, [key]: { sent: 0, total: ubs.length } }))
    try {
      for (let i = 0; i < ubs.length; i++) {
        await printCertUbLabel(ubs[i])
        setPrinting((p) => ({ ...p, [key]: { sent: i + 1, total: ubs.length } }))
      }
      // 완료 — 1.5s 후 상태 제거 (사용자 시각 피드백 후 원래 버튼으로 복원)
      setTimeout(() => setPrinting((p) => {
        const next = { ...p }; delete next[key]; return next
      }), 1500)
    } catch (e) {
      setPrinting((p) => ({ ...p, [key]: { ...(p[key] || {}), error: e.message || '인쇄 실패' } }))
    }
  }

  const fmtDate = (iso) => {
    if (!iso) return '—'
    try {
      const d = new Date(iso)
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return iso
    }
  }

  return (
    <div className="page-flat">
      <PageHeader title="Cert 페이지 미리보기" onBack={onBack} />

      <div className={s.toolbar}>
        <input
          className={s.search}
          placeholder="MB / OB / UB lot 번호 검색"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className={s.count}>
          {loading ? '로딩 중...' : `${filtered.length} / ${items.length}건`}
        </span>
      </div>

      {error && <div className={s.error}>⚠ {error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className={s.empty}>출하된 MB 가 없습니다.</div>
      )}

      <div className={s.list}>
        {filtered.map((it) => {
          const ubs = it.ub_lot_nos || (it.ub_lot_no ? [it.ub_lot_no] : [])
          const sel = selectedUbs[it.mb_lot_no] || new Set()
          const selCount = sel.size
          const allSelected = ubs.length > 0 && selCount === ubs.length
          const noneSelected = selCount === 0
          const st = printing[it.mb_lot_no]
          const inProgress = st && st.sent < st.total && !st.error
          const done = st && st.sent === st.total && !st.error
          const errored = st && st.error
          const printLabel = errored
            ? `⚠ ${st.error}`
            : done
              ? `✓ ${st.total}장 완료`
              : inProgress
                ? `🖨 ${st.sent}/${st.total}…`
                : `🖨 라벨 ${selCount}장 인쇄`
          return (
            <div key={it.mb_lot_no} className={s.row}>
              <div className={s.rowMain}>
                <div className={s.lots}>
                  <span className={s.mb}>{it.mb_lot_no}</span>
                  <span className={s.sub}>OB {it.ob_lot_no}</span>
                </div>
                <div className={s.meta}>
                  <span className={s.shipped}>Shipped: {fmtDate(it.shipped_at)}</span>
                  <span className={s.pw}>PW: {it.pw || '—'}</span>
                </div>
                {/* UB 체크박스 드롭다운 — 헤더 클릭으로 펼침 (2026-05-01, 기본=접힘) */}
                {ubs.length > 0 && (() => {
                  const expanded = !!expandedRows[it.mb_lot_no]
                  return (
                    <div className={s.ubSection}>
                      <div
                        className={s.ubHeader}
                        onClick={() => toggleExpand(it.mb_lot_no)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleExpand(it.mb_lot_no)
                          }
                        }}
                      >
                        <label className={s.ubAll} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = !allSelected && !noneSelected
                            }}
                            onChange={() => toggleAllUbs(it.mb_lot_no, ubs)}
                          />
                          <span>전체</span>
                        </label>
                        <span className={s.ubCount}>
                          {selCount} / {ubs.length}
                        </span>
                        <span
                          className={s.ubChevron}
                          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                      </div>
                      <div
                        className={s.ubBody}
                        style={{
                          maxHeight: expanded ? 600 : 0,
                          opacity: expanded ? 1 : 0,
                        }}
                      >
                        <div className={s.ubGrid}>
                          {ubs.map((ub) => (
                            <label key={ub} className={s.ubItem}>
                              <input
                                type="checkbox"
                                checked={sel.has(ub)}
                                onChange={() => toggleUb(it.mb_lot_no, ub)}
                              />
                              <span>{ub}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
              <div className={s.actions}>
                <button
                  type="button"
                  className={s.btnMb}
                  onClick={() => open(it.url_mb)}
                  disabled={!it.url_mb}
                  title={it.url_mb}
                >
                  MB 페이지
                </button>
                <button
                  type="button"
                  className={s.btnUb}
                  onClick={() => open(it.url_ub)}
                  disabled={!it.url_ub}
                  title={it.url_ub}
                >
                  UB 페이지
                </button>
                {/* 외부 라벨 인쇄 — 체크된 UB 만 1장씩 (2026-05-01) */}
                <button
                  type="button"
                  className={s.btnPrint}
                  onClick={() => handlePrintLabels(it)}
                  disabled={selCount === 0 || inProgress}
                  title={
                    selCount > 0
                      ? `선택한 UB: ${ubs.filter((u) => sel.has(u)).join(', ')}`
                      : '체크박스로 인쇄할 UB 를 선택하세요'
                  }
                >
                  {printLabel}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
