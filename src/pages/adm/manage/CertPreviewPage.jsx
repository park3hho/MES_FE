// pages/adm/manage/CertPreviewPage.jsx
// 관리자 전용 — Cert 페이지 빠른 진입 (블랙박스 테스트 편의, 2026-04-29)
//
// 흐름:
//   GET /cert-admin/mbs → 출하된 MB 목록 + cert URL 사전 빌드
//   행 클릭 시 cert.faraday-dynamics.com/{token}#pw=... 새 탭으로 이동
//   (URL fragment #pw 는 cert FE 가 자동 인증에 사용)

import { useState, useEffect } from 'react'
import PageHeader from '@/components/common/PageHeader'
import { getCertAdminMbs } from '@/api'
import s from './CertPreviewPage.module.css'

export default function CertPreviewPage({ onBack }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

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
        {filtered.map((it) => (
          <div key={it.mb_lot_no} className={s.row}>
            <div className={s.rowMain}>
              <div className={s.lots}>
                <span className={s.mb}>{it.mb_lot_no}</span>
                <span className={s.sub}>OB {it.ob_lot_no}</span>
                {it.ub_lot_no && <span className={s.sub}>UB {it.ub_lot_no}</span>}
              </div>
              <div className={s.meta}>
                <span className={s.shipped}>Shipped: {fmtDate(it.shipped_at)}</span>
                <span className={s.pw}>PW: {it.pw || '—'}</span>
              </div>
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
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
