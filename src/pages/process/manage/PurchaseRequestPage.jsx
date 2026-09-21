// src/pages/process/manage/PurchaseRequestPage.jsx
// 구매 의뢰 — 목록 (2026-09-16)
//   ★ 임시저장·취소가 없다(사용자 결정). 제출 = 확정이고 잘못 쓴 건 승인자가 반려한다.
//   ★ '승인 대기' 탭은 지정 승인자에게만 보인다 — 권한은 feature 가 아니라 BE 지정 목록이 정한다.
//     그래서 탭을 그리기 전에 meta 로 내 자격을 먼저 받는다(안 그러면 눌러보고서야 403 을 안다).
//   ★ 설정(승인자·구매 담당 지정)은 화면을 따로 만들지 않고 톱니 모달로 둔다 — 라우트를 늘릴 만한 분량이 아니다.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { listPurchaseRequests, getPurchaseRequestMeta } from '@/api'
import AssigneeModal from './PurchaseAssigneeModal'
import s from './PurchaseRequest.module.css'

// BE models/purchase/purchase_request.py 와 문자열 동기 (진실의 원천은 BE)
export const BADGE = {
  submitted: s.bSubmitted, approved: s.bApproved,
  purchased: s.bPurchased, rejected: s.bRejected,
}
export const SHORT = {
  submitted: '대기', approved: '승인', purchased: '완료', rejected: '반려',
}

const TABS = [
  { key: 'mine', label: '내 의뢰' },
  { key: 'pending', label: '승인 대기' },
  { key: 'all', label: '전체' },
]

// 저장은 UTC · 표시는 KST (시각대 규약). 목록은 'MM-DD HH:mm' 까지만 보여준다.
export const fmtWhen = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 해외송금 나라 코드 → 한글 이름 (2026-09-21). 작성·상세 화면이 같이 쓴다.
//   브라우저 내장 목록이라 전 세계가 다 된다 — 표를 따로 두지 않는다(BE 봇 DM 은 자체 표 + 코드 폴백).
//   ★ 옛 브라우저(Intl.DisplayNames 없음)·모르는 코드면 빈 문자열 — 부르는 쪽이 코드로 폴백한다.
let regionNames = null
try { regionNames = new Intl.DisplayNames(['ko'], { type: 'region' }) } catch { /* 코드만 보여준다 */ }
export const countryName = (code) => {
  if (!/^[A-Z]{2}$/.test(code || '') || !regionNames) return ''
  try {
    const n = regionNames.of(code)
    return n && n !== code ? n : ''
  } catch { return '' }
}

export default function PurchaseRequestPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState('mine')
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [msg, setMsg] = useState(null)
  const [showSetting, setShowSetting] = useState(false)

  const loadMeta = useCallback(async () => {
    try {
      setMeta(await getPurchaseRequestMeta())
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    }
  }, [])
  useEffect(() => { loadMeta() }, [loadMeta])

  const load = useCallback(async () => {
    try {
      setRows(await listPurchaseRequests(tab))
      setMsg(null)
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
      setRows([])
    }
  }, [tab])
  useEffect(() => { load() }, [load])

  // 승인자가 아니면 '승인 대기' 탭을 감춘다 — 눌러도 403 이라 보여줄 이유가 없다.
  const tabs = TABS.filter((t) => t.key !== 'pending' || meta?.is_approver)
  const canManage = meta?.can_manage ?? false

  return (
    <div className="page-flat">
      <PageHeader
        title="구매 의뢰"
        subtitle="필요한 물건을 올리면 승인자가 결재합니다"
        onBack={() => nav('/admin/manage')}
      />
      <div className="page-content">
        {msg && <p className={msg.type === 'err' ? s.msgErr : s.msgOk}>{msg.text}</p>}

        {/* 승인자가 없으면 아무도 제출할 수 없다(BE 가 409로 막는다) — 먼저 알려준다 */}
        {meta && meta.approver_count === 0 && (
          <p className={s.warnBox}>
            승인자가 지정되지 않아 지금은 의뢰를 제출할 수 없습니다.
            {canManage ? ' 아래 설정에서 승인자를 지정해주세요.' : ' 관리자에게 지정을 요청해주세요.'}
          </p>
        )}

        <div className={s.tabs}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={tab === t.key ? s.chipOn : s.chip}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {tab === t.key && rows.length > 0 && <span className={s.count}>{rows.length}</span>}
            </button>
          ))}
          <button
            type="button"
            className={`btn-primary btn-sm ${s.pushRight}`}
            onClick={() => nav('/admin/purchase/requests/new')}
          >
            + 새 의뢰
          </button>
          {canManage && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              aria-label="승인자 지정"
              onClick={() => setShowSetting(true)}
            >
              설정
            </button>
          )}
        </div>

        {rows.length === 0
          ? <p className={s.empty}>{tab === 'pending' ? '결재할 의뢰가 없습니다.' : '아직 의뢰가 없습니다.'}</p>
          : (
            <div className={s.rows}>
              {rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`${s.row} ${r.status === 'submitted' ? '' : s.rowDone}`}
                  onClick={() => nav(`/admin/purchase/requests/${r.id}`)}
                >
                  {r.thumb_url
                    ? <img className={s.thumb} src={r.thumb_url} alt="" />
                    : <span className={s.thumbEmpty} />}
                  <span className={s.rowText}>
                    <span className={s.rowTitle}>{r.title}</span>
                    <span className={s.rowMeta}>
                      {r.req_no} · {fmtWhen(r.created_at)}
                      {r.platform ? ` · ${r.platform}` : ''}
                      {r.file_count ? ` · 첨부 ${r.file_count}` : ''}
                      {tab !== 'mine' && r.requester_name ? ` · ${r.requester_name}` : ''}
                    </span>
                  </span>
                  <span className={`${s.badge} ${BADGE[r.status] || ''}`}>
                    {SHORT[r.status] || r.status}
                  </span>
                </button>
              ))}
            </div>
          )}
      </div>

      {showSetting && (
        <AssigneeModal
          onClose={() => setShowSetting(false)}
          onSaved={() => { setShowSetting(false); loadMeta() }}
        />
      )}
    </div>
  )
}
