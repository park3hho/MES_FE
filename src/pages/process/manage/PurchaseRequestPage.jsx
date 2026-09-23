// src/pages/process/manage/PurchaseRequestPage.jsx
// 구매 의뢰 — 목록 (2026-09-16)
//   ★ 임시저장·취소가 없다(사용자 결정). 제출 = 확정이고 잘못 쓴 건 승인자가 반려한다.
//   ★ '승인 대기' 탭은 지정 승인자에게만 보인다 — 권한은 feature 가 아니라 BE 지정 목록이 정한다.
//     그래서 탭을 그리기 전에 meta 로 내 자격을 먼저 받는다(안 그러면 눌러보고서야 403 을 안다).
//   ★ 설정(승인자·구매 담당 지정)은 화면을 따로 만들지 않고 톱니 모달로 둔다 — 라우트를 늘릴 만한 분량이 아니다.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { useMobile } from '@/hooks/useMobile'
import { BP } from '@/constants/breakpoints'
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
  { key: 'dept', label: '우리 부서' },   // 2026-09-22 부서 D7~D9 — 의뢰 당시 부서 기준, 권한 purchase.view_dept
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

// ── 목록 표시 헬퍼 (2026-09-23) ──────────────────────────────────────────
// 결제 조건 — 목록에서 **해외송금을 먼저 알아보게** 한다. 필요 서류도 리스크도 국내건과 달라서,
//   열어보기 전에 카드인지 해외송금인지 몰랐던 게 이 화면의 가장 큰 구멍이었다.
const payInfo = (r) => {
  if (r.pay_type !== 'transfer') return { cls: s.condCard, text: '카드' }
  if (r.transfer_scope === 'overseas') {
    const c = countryName(r.payee_country) || r.payee_country
    return { cls: s.condOv, text: c ? `해외송금 · ${c}` : '해외송금' }
  }
  return { cls: s.condTr, text: r.transfer_scope_label || '계좌이체' }
}

// 용도 — 제목과 같으면 뺀다. 실제로 제목과 똑같이 적힌 의뢰가 있어 같은 말을 두 번 읽게 된다.
const purposeOf = (r) => {
  const p = (r.purpose || '').trim()
  return p && p !== (r.title || '').trim() ? p : ''
}

// 첨부 — 1개면 파일명을 그대로 보여준다. '첨부 1' 로는 견적서인지 사진인지 알 수 없다.
const fileLabel = (r) => {
  const n = r.file_count || 0
  if (!n) return ''
  const f = (r.files || [])[0]
  return n === 1 && f && f.filename ? f.filename : `첨부 ${n}`
}

// 금액 — 통화까지 붙인다. 해외송금은 USD·CNY 가 섞여서 숫자만 두면 ₩600,000 인지 $600 인지 모른다.
//   ★ 모르는 통화 코드면 Intl 이 던진다 → 코드를 뒤에 붙여 그대로 보여준다(빈칸보다 낫다).
const fmtAmount = (r) => {
  const v = Number(r.total_amount || 0)
  if (!v) return ''
  const cur = (r.currency || 'KRW').toUpperCase()
  try {
    return new Intl.NumberFormat('ko-KR',
      { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v)
  } catch {
    return `${v.toLocaleString('ko-KR')} ${cur}`
  }
}

// 첨부 종류 아이콘 — 빈 점선 박스를 대신한다. 스크린샷이 아닌 첨부(견적서 PDF)는 썸네일이 없어
//   지금은 3건 중 2건이 빈 박스로 나온다. FE 에 아이콘 폰트가 없어 인라인 SVG 를 쓴다.
const IconDoc = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />
  </svg>
)
const IconLink = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
  </svg>
)
const rowIcon = (r) => (!r.file_count && r.link ? <IconLink /> : <IconDoc />)

export default function PurchaseRequestPage() {
  const nav = useNavigate()
  const [tab, setTab] = useState('mine')
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [msg, setMsg] = useState(null)
  const [showSetting, setShowSetting] = useState(false)
  // 768 이하는 카드, 그 위는 표. 표를 CSS 로 감추지 않고 아예 안 그린다(행이 늘면 숨긴 표도 비용이다).
  const isNarrow = useMobile(BP.tablet)

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
  // '전체' 도 같다 — 자격이 없으면 서버가 조용히 '내 것'으로 좁혀서 '내 의뢰'와 똑같은 목록이 나온다.
  //   자격 = 전체 열람 권한 또는 지정 담당자(BE list_requests 와 같은 조건).
  const seeAll = meta?.can_view_all || meta?.is_approver || meta?.is_purchaser
  // '우리 부서' — 권한(purchase.view_dept)이 있고 소속이 있을 때만. 판정은 BE meta.can_view_dept 그대로.
  const tabs = TABS.filter((t) =>
    (t.key !== 'pending' || meta?.is_approver) && (t.key !== 'all' || seeAll)
    && (t.key !== 'dept' || meta?.can_view_dept))
  const canManage = meta?.can_manage ?? false
  // 금액 열 — 값이 있는 행이 하나라도 있을 때만 낸다. 품목 값(수량·금액)은 2026-09-23 추가분이라
  //   그 전 의뢰는 0 이다. 빈 열을 늘 세워 두면 표만 넓어지고 읽을 게 없다.
  const hasAmount = rows.some((r) => Number(r.total_amount || 0) > 0)

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
          : isNarrow ? (
            /* 모바일 — 한 줄 카드. 결제 조건은 제목 아래 칩으로 접힌다 */
            <div className={s.rows}>
              {rows.map((r) => {
                const pay = payInfo(r)
                const purp = purposeOf(r)
                const file = fileLabel(r)
                const amt = fmtAmount(r)
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`${s.row} ${r.status === 'submitted' ? s.rowWait : s.rowDone}`}
                    onClick={() => nav(`/admin/purchase/requests/${r.id}`)}
                  >
                    <span className={s.mStripe} />
                    {r.thumb_url
                      ? <img className={s.thumb} src={r.thumb_url} alt="" />
                      : <span className={s.mIcon}>{rowIcon(r)}</span>}
                    <span className={s.rowText}>
                      <span className={s.rowTitle}>{r.title}</span>
                      <span className={s.rowMeta}>
                        {r.req_no} · {fmtWhen(r.created_at)}
                        {r.platform ? ` · ${r.platform}` : ''}
                        {tab !== 'mine' && r.requester_name ? ` · ${r.requester_name}` : ''}
                        {tab !== 'mine' && r.department_name ? ` (${r.department_name})` : ''}
                      </span>
                    </span>
                    <span className={`${s.badge} ${BADGE[r.status] || ''}`}>
                      {SHORT[r.status] || r.status}
                    </span>
                    <span className={s.mChips}>
                      <span className={`${s.cond} ${pay.cls}`}>{pay.text}</span>
                      {amt && <span className={`${s.cond} ${s.condAmt}`}>{amt}</span>}
                      {purp && <span className={`${s.cond} ${s.condPlain}`}>용도 {purp}</span>}
                      {file && <span className={`${s.cond} ${s.condPlain}`}>{file}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            /* 데스크톱 — 표. 같은 항목이 같은 세로줄에 있어야 여러 건을 훑어 비교할 수 있다 */
            <div className={s.tableWrap}>
              <table className={s.listTable}>
                <thead>
                  <tr>
                    <th className={s.thSt}>상태</th>
                    <th>제품</th>
                    <th className={s.thPay}>결제</th>
                    {hasAmount && <th className={s.thAmt}>금액</th>}
                    <th className={s.thFile}>첨부</th>
                    {tab !== 'mine' && <th className={s.thWho}>의뢰자</th>}
                    <th className={s.thWhen}>등록</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const pay = payInfo(r)
                    const purp = purposeOf(r)
                    const file = fileLabel(r)
                    const go = () => nav(`/admin/purchase/requests/${r.id}`)
                    return (
                      <tr
                        key={r.id}
                        tabIndex={0}
                        className={r.status === 'submitted' ? s.trWait : ''}
                        onClick={go}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go() }
                        }}
                      >
                        <td>
                          <span className={`${s.badge} ${BADGE[r.status] || ''}`}>
                            {SHORT[r.status] || r.status}
                          </span>
                        </td>
                        <td>
                          <div className={s.cellTitle}>{r.title}</div>
                          <div className={s.cellSub}>
                            {r.req_no}
                            {purp ? ` · 용도 ${purp}` : ''}
                            {r.platform ? ` · ${r.platform}` : ''}
                            {tab !== 'mine' && r.department_name ? ` · ${r.department_name}` : ''}
                          </div>
                        </td>
                        <td>
                          <span className={`${s.cond} ${pay.cls}`}>{pay.text}</span>
                          {r.pay_timing_label
                            ? <span className={s.cellMuted}> {r.pay_timing_label}</span> : ''}
                        </td>
                        {hasAmount && (
                          <td className={s.cellAmt}>
                            {fmtAmount(r) || <span className={s.cellMuted}>—</span>}
                          </td>
                        )}
                        <td>
                          {file
                            ? <span className={`${s.cond} ${s.condPlain}`}>{file}</span>
                            : <span className={s.cellMuted}>—</span>}
                        </td>
                        {tab !== 'mine' && (
                          <td>{r.requester_name || <span className={s.cellMuted}>—</span>}</td>
                        )}
                        <td className={s.cellWhen}>{fmtWhen(r.created_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
