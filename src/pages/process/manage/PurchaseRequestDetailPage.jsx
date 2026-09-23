// src/pages/process/manage/PurchaseRequestDetailPage.jsx
// 구매 의뢰 — 상세 · 결재 (2026-09-16 / 2026-09-23 레이아웃 개편)
//   ★ 같은 화면을 의뢰자·승인자·구매 담당이 함께 본다. 화면을 나누지 않고 **결재만** 아래 고정 바로
//     떼어냈다(사용자 결정 2026-09-23 · B안). 나누면 알림 링크가 어디로 가야 할지 갈라져 결국 합치게 된다.
//   ★ 내용은 '의뢰 내용 / 결제 조건 / 진행' 세 덩이를 **얇은 선으로만** 나눈다 — 상자를 겹치면
//     승인자가 어디부터 읽어야 할지 모른다.
//   ★ 값은 라벨 + 값 한 줄씩. **값이 없으면 줄째로 빠진다** — 빈 줄이 늘어서면 뭘 안 적었는지 안 보인다.
//   ★ 반려는 사유가 필수다(BE 가 422 로 막는다) — 화면에서도 비어 있으면 못 누르게 한다.
//   ★ 첨부 미리보기는 presigned URL 이라 만료된다(10분). 새로 열면 다시 받는다.
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import {
  getPurchaseRequest, getPurchaseRequestMeta, getPurchaseRequestFileUrl,
  approvePurchaseRequest, rejectPurchaseRequest, completePurchaseRequest,
  retryPurchaseRequestFileNw,
} from '@/api'
import { BADGE, countryName, fmtWhen } from './PurchaseRequestPage'
import s from './PurchaseRequest.module.css'

const LABEL = {
  submitted: '승인 대기', approved: '승인됨', purchased: '구매 완료', rejected: '반려',
}
const ext = (name) => (name?.includes('.') ? name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE')
// 'HK' → '홍콩(HK)'. 이름을 모르면 코드만 — 봇 DM(country_label)과 같은 모양
const nation = (code) => (code ? (countryName(code) ? `${countryName(code)}(${code})` : code) : '')

// 금액 (2026-09-23) — 기호는 **헷갈릴 일이 없는 통화만** 붙이고 나머지는 코드를 적는다.
//   ★ CNY·JPY 는 둘 다 ¥ 다. 기호만 보이면 4,200 위안인지 4,200 엔인지 알 수 없다 — 코드로 적는다.
const SIGN = { KRW: '₩', USD: '$', EUR: '€' }
const money = (v, cur) => {
  const n = Number(v || 0)
  if (!n) return ''
  const txt = n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  const c = cur || 'KRW'
  return SIGN[c] ? `${SIGN[c]}${txt}` : `${c} ${txt}`
}
// 수량 — 소수 3자리까지. 5.000 은 '5' 로 보인다.
//   ★ 단위를 같이 그린다 (2026-09-23) — '400' 만으로는 400개인지 400kg 인지 알 수 없다.
//     옛 의뢰(단위 없음)는 종전처럼 숫자만 나온다.
const qtyText = (v, unit = '') => {
  const n = Number(v || 0)
  if (!n) return ''
  const txt = n.toLocaleString('ko-KR', { maximumFractionDigits: 3 })
  return unit ? `${txt} ${unit}` : txt
}

// 라벨 + 값 한 줄. 값이 비면 아무것도 그리지 않는다.
function Row({ label, children }) {
  if (!children) return null
  return (
    <div className={s.vRow}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// 결재 바의 도장 아이콘 — MES_FE 에는 아이콘 폰트가 없다(인라인 SVG 로만 그린다)
const StampIcon = () => (
  <svg
    width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
  >
    <path d="M5 21h14" />
    <path d="M7 18v-2a5 5 0 0 1 10 0v2z" />
    <path d="M10 11V8a2 2 0 1 1 4 0v3" />
  </svg>
)

export default function PurchaseRequestDetailPage() {
  const nav = useNavigate()
  const { reqId } = useParams()
  const { state } = useLocation()
  const [req, setReq] = useState(null)
  const [meta, setMeta] = useState(null)
  const [urls, setUrls] = useState({})            // fileId → presigned URL (스크린샷 미리보기)
  const [rejecting, setRejecting] = useState(false)
  const [comment, setComment] = useState('')
  const [msg, setMsg] = useState(null)
  const [notice, setNotice] = useState(state?.notice || '')
  const [busy, setBusy] = useState(false)
  const refreshed = useRef(false)      // 드라이브 대기 건 자동 새로고침은 한 번만

  const load = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([getPurchaseRequest(reqId), getPurchaseRequestMeta()])
      setReq(d)
      setMeta(m)
      // 스크린샷만 미리 URL 을 받는다. 파일은 누를 때 받아도 늦지 않다(요청을 아낀다).
      const shots = (d.files || []).filter((f) => f.kind === 'screenshot')
      const pairs = await Promise.all(
        shots.map(async (f) => [f.id, await getPurchaseRequestFileUrl(f.id, true).catch(() => '')]),
      )
      setUrls(Object.fromEntries(pairs))
      // 드라이브 업로드는 제출 응답 뒤에 도는 작업이라 방금 받은 상태는 '대기'다.
      //   잠시 뒤 한 번만 다시 확인한다 — 계속 폴링하면 열어두기만 해도 서버를 두드린다.
      //   제출 직후에는 첨부가 없어도 알림이 아직 안 끝났을 수 있어 한 번 더 읽는다.
      const pending = (d.files || []).some((f) => f.nw_status === 'pending')
      if (!refreshed.current && (pending || state?.justSubmitted)) {
        refreshed.current = true
        setTimeout(() => { load() }, 4000)
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    }
  }, [reqId, state])
  useEffect(() => { load() }, [load])

  const openFile = async (f) => {
    try {
      const url = await getPurchaseRequestFileUrl(f.id, false)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    }
  }

  const retryNw = async (fileId) => {
    setBusy(true); setMsg(null)
    try {
      const d = await retryPurchaseRequestFileNw(fileId)
      setMsg(d.ok
        ? { type: 'ok', text: '드라이브에 올렸습니다.' }
        : { type: 'err', text: `드라이브 업로드 실패 — ${d.file?.nw_error || '사유 미상'}` })
      await load()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const act = async (fn, okText) => {
    setBusy(true); setMsg(null)
    try {
      const d = await fn()
      setReq(d.request)
      setRejecting(false)
      setComment('')
      const miss = d.notify?.not_notified || []
      const pre = (d.notify?.preflight || []).map((p) => p.detail).join(' / ')
      setNotice([
        miss.length ? `알림 못 받음: ${miss.join(', ')}` : '',
        pre,
      ].filter(Boolean).join(' · '))
      setMsg({ type: 'ok', text: okText })
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  if (!req) {
    return (
      <div className="page-flat">
        <PageHeader title="구매 의뢰" onBack={() => nav('/admin/purchase/requests')} />
        <div className="page-content">
          {msg ? <p className={s.msgErr}>{msg.text}</p> : <p className={s.empty}>불러오는 중...</p>}
        </div>
      </div>
    )
  }

  const shots = (req.files || []).filter((f) => f.kind === 'screenshot')
  const docs = (req.files || []).filter((f) => f.kind !== 'screenshot')
  const nwBad = (req.files || []).filter((f) => f.nw_status && f.nw_status !== 'done')
  // 승인 버튼은 **이 의뢰**의 판정(req.can_decide — 승인 체계: 부서장/전역)으로 그린다 (2026-09-23).
  //   옛 BE 는 can_decide 가 없어 meta.is_approver(어디선가 승인자)로 떨어진다.
  //   ★ 본인이 올린 의뢰도 승인자면 그대로 승인·반려한다 (2026-09-23 사용자 지시).
  const canApprove = req.status === 'submitted' && (req.can_decide ?? meta?.is_approver)
  const canBuy = req.status === 'approved' && meta?.is_purchaser
  // 내가 누를 게 없는 대기 상태 — 바를 회색으로 두고 '누가 뭘 기다리는지'만 적는다.
  //   ★ 바를 통째로 감추지 않는다: 눌러도 안 되는 게 아니라 '내 차례가 아님' 을 알려야
  //     DM 을 받고 들어온 사람이 자기 차례인지 아닌지 안다.
  const waitFor = !canApprove && !canBuy
    ? { submitted: '승인을 기다리는 중', approved: '구매 담당의 구매를 기다리는 중' }[req.status] || ''
    : ''
  const showBar = Boolean(canApprove || canBuy || waitFor)
  const total = money(req.total_amount, req.currency)
  const payTags = [req.pay_type_label, req.transfer_scope_label, req.pay_timing_label].filter(Boolean)

  return (
    <div className="page-flat">
      <PageHeader
        title="의뢰 상세"
        subtitle={LABEL[req.status] || req.status}
        onBack={() => nav('/admin/purchase/requests')}
      />
      <div className="page-content">
        {msg && <p className={msg.type === 'err' ? s.msgErr : s.msgOk}>{msg.text}</p>}
        {notice && <p className={s.notice}>{notice}</p>}
        {/* 제출 알림은 백그라운드라 응답에 결과가 없다 — 서버가 적어둔 미수신 사유를 보여준다 */}
        {req.notify_note && <p className={s.warnBox}>{req.notify_note}</p>}

        {req.status === 'rejected' && (
          <p className={s.rejectBox}>
            <b>반려됨</b> — {req.approver_name || '-'} · {fmtWhen(req.decided_at)}
            <br />{req.decision_comment || '사유 없음'}
            <br />다시 올리려면 새 의뢰를 작성하세요.
          </p>
        )}

        <p className={s.detailTitle}>{req.title}</p>
        <p className={s.detailMeta}>
          {req.req_no} · {req.requester_name || '-'}
          {req.department_name ? ` (${req.department_name})` : ''} · {fmtWhen(req.created_at)}
          {' '}
          <span className={`${s.badge} ${BADGE[req.status] || ''}`}>
            {LABEL[req.status] || req.status}
          </span>
        </p>

        {/* ── 의뢰 내용 — 무엇을 왜 사는가. 승인자가 가장 먼저 읽는 덩이 ── */}
        <div className={s.sec}>
          <div className={s.secHead}>의뢰 내용</div>
          <div className={s.two}>
            <div>
              <dl className={s.vList}>
                <Row label="품명">{req.title}</Row>
                <Row label="규격">{req.spec}</Row>
                <Row label="수량">{qtyText(req.quantity, req.unit)}</Row>
                <Row label="단가">{money(req.unit_price, req.currency)}</Row>
                <Row label="합계 금액"><b>{total}</b></Row>
                <Row label="용도">{req.purpose}</Row>
                <Row label="공급처">{req.supplier_name}</Row>
                <Row label="견적일">{req.quote_date}</Row>
                <Row label="구매처">
                  {req.link && (
                    <a className={s.link} href={req.link} target="_blank" rel="noopener noreferrer">
                      {req.platform || '구매처'} 에서 보기 ↗
                    </a>
                  )}
                </Row>
                <Row label="메모">{req.memo}</Row>
              </dl>
            </div>

            <div>
              {shots.length > 0 && (
                <>
                  <div className={s.secHeadSm}>스크린샷 {shots.length}장</div>
                  <div className={s.shots}>
                    {shots.map((f) => (
                      <a
                        key={f.id} className={s.shot} href={urls[f.id] || '#'}
                        target="_blank" rel="noopener noreferrer"
                      >
                        {urls[f.id] && <img src={urls[f.id]} alt={f.filename} />}
                      </a>
                    ))}
                  </div>
                </>
              )}
              {docs.length > 0 && (
                <>
                  <div className={s.secHeadSm}>파일 {docs.length}개</div>
                  <div className={s.files}>
                    {docs.map((f) => (
                      <div key={f.id} className={s.file}>
                        <span className={s.fileIcon}>{ext(f.filename)}</span>
                        <span className={s.fileName}>
                          {f.filename}
                          {/* 드라이브에 올라갔는지는 여기서만 보인다 — 실패 건은 아래 목록에 따로 뜬다 */}
                          {f.nw_status === 'done' && <i className={s.fileSub}>드라이브 저장됨</i>}
                        </span>
                        <button type="button" className="btn-text" onClick={() => openFile(f)}>
                          받기
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* 드라이브에 아직 안 올라간 첨부 — 실패가 조용히 묻히면 안 된다.
                  사유를 그대로 보여주고 그 자리에서 다시 올린다(검수 자료 화면과 같은 방식). */}
              {nwBad.length > 0 && (
                <>
                  <div className={s.secHeadSm}>드라이브 업로드 {nwBad.length}건</div>
                  <div className={s.files}>
                    {nwBad.map((f) => (
                      <div key={f.id} className={s.file}>
                        <span className={s.fileIcon}>{f.nw_status === 'failed' ? '!' : '···'}</span>
                        <span className={s.fileName}>{f.filename}</span>
                        <span className={s.fileSize}>
                          {f.nw_status === 'failed' ? (f.nw_error || '실패') : '올리는 중'}
                        </span>
                        {/* 대기 상태로 굳은 건(마이그레이션 이전 행·서버 재시작)도 손으로 올릴 수 있어야 한다 */}
                        <button
                          type="button" className="btn-text" disabled={busy}
                          onClick={() => retryNw(f.id)}
                        >
                          재시도
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── 결제 조건 — 돈이 어디로 가는가. 틀리면 돈이 엉뚱한 곳으로 간다 ── */}
        {(payTags.length > 0 || req.account_no) && (
          <div className={s.sec}>
            <div className={s.secHead}>결제 조건</div>
            <dl className={s.vList}>
              <Row label="결제 수단">
                {payTags.length > 0 && payTags.map((t) => (
                  <span key={t} className={s.payTag}>{t}</span>
                ))}
              </Row>
              <Row label="입금 계좌">
                {req.account_no && `${req.account_bank || ''} ${req.account_no}`.trim()}
              </Row>
              <Row label="예금주">{req.account_holder}</Row>
              {/* 해외송금 — 국내 건은 빈 문자열이라 줄이 통째로 빠진다 (2026-09-21).
                  수취인 / 지급은행을 줄로 나눈다 — 나라가 다를 수 있어 한 줄에 섞으면 누구 것인지 모른다.
                  라벨은 은행 송금 화면 용어 그대로(봇 DM 과 같다). */}
              <Row label="수취인 소재지">
                {[nation(req.payee_country), req.payee_city, req.payee_addr]
                  .filter(Boolean).join(' · ')}
              </Row>
              <Row label="지급 은행">
                {[nation(req.bank_country), req.bank_swift && `SWIFT ${req.bank_swift}`, req.bank_addr]
                  .filter(Boolean).join(' · ')}
              </Row>
            </dl>
          </div>
        )}

        {/* ── 진행 — 누가 언제 무엇을 했나 ── */}
        <div className={`${s.sec} ${s.secLast}`}>
          <div className={s.secHead}>진행</div>
          <ul className={s.timeline}>
            <li className={`${s.tlItem} ${s.tlDone}`}>
              <b>제출</b>
              <span className={s.tlWhen}>{req.requester_name} · {fmtWhen(req.created_at)}</span>
            </li>
            <li
              className={`${s.tlItem} ${req.status === 'rejected' ? s.tlRejected : ''} ${
                ['approved', 'purchased'].includes(req.status) ? s.tlDone : ''}`}
            >
              <b>{req.status === 'rejected' ? '반려' : '승인'}</b>
              <span className={s.tlWhen}>
                {req.decided_at ? `${req.approver_name} · ${fmtWhen(req.decided_at)}` : '대기 중'}
              </span>
              {/* 승인하며 남긴 말 — 반려 사유는 위 빨간 상자에 이미 크게 뜬다 */}
              {req.status !== 'rejected' && req.decision_comment && (
                <span className={s.tlNote}>{req.decision_comment}</span>
              )}
            </li>
            <li className={`${s.tlItem} ${req.status === 'purchased' ? s.tlDone : ''}`}>
              <b>구매</b>
              <span className={s.tlWhen}>
                {req.bought_at ? `${req.purchaser_name} · ${fmtWhen(req.bought_at)}` : '대기 중'}
              </span>
            </li>
          </ul>

          {req.records?.length > 0 && (
            <>
              <div className={s.secHeadSm}>연결된 구매 검수</div>
              {req.records.map((rec) => (
                <p key={rec.id} className={s.block}>
                  {rec.insp_no ? `${rec.insp_no} · ` : ''}{rec.title} · {rec.purchased_at || ''}
                </p>
              ))}
            </>
          )}
        </div>

        {rejecting && (
          <div className={s.field}>
            <label className="form-label" htmlFor="pr-reject">반려 사유</label>
            <textarea
              id="pr-reject" className="form-input" rows={3} value={comment} maxLength={500}
              placeholder="의뢰자에게 그대로 전달됩니다"
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        )}

        {/* 고정 바가 내용 끝을 가리지 않게 그만큼 자리를 비운다 */}
        {showBar && <div className={s.barSpace} />}
      </div>

      {/* ── 결재 바 (2026-09-23 · B안) ──
          ★ position:fixed 다. 내용이 길어도 스크롤 없이 바로 누를 수 있다 — DM 링크로 들어와
            승인만 하고 나가는 흐름이 가장 많다.
          ★ left 는 SideNav 폭만큼 띄운다(.sticky-cta 와 같은 규칙) — 데스크톱에서 nav 를 덮으면 안 된다. */}
      {showBar && (
        <div className={`${s.apBar} ${canApprove || canBuy ? '' : s.apBarMuted}`}>
          <span className={s.apBarTxt}>
            <StampIcon />
            <b>{canApprove ? '결재할 차례' : canBuy ? '구매할 차례' : waitFor}</b>
            <i>
              {canApprove || canBuy
                ? [`${req.requester_name || '-'} 의뢰`, total].filter(Boolean).join(' · ')
                : '내 차례가 아닙니다'}
            </i>
          </span>

          {canApprove && !rejecting && (
            <span className={s.apBarBtns}>
              <button
                type="button" className="btn-danger btn-md" disabled={busy}
                onClick={() => setRejecting(true)}
              >
                반려
              </button>
              <button
                type="button" className="btn-primary btn-md" disabled={busy}
                onClick={() => act(() => approvePurchaseRequest(req.id), '승인했습니다.')}
              >
                승인
              </button>
            </span>
          )}
          {canApprove && rejecting && (
            <span className={s.apBarBtns}>
              <button
                type="button" className="btn-secondary btn-md" disabled={busy}
                onClick={() => { setRejecting(false); setComment('') }}
              >
                취소
              </button>
              <button
                type="button" className="btn-danger btn-md" disabled={busy || !comment.trim()}
                onClick={() => act(() => rejectPurchaseRequest(req.id, comment.trim()), '반려했습니다.')}
              >
                반려하기
              </button>
            </span>
          )}
          {canBuy && (
            <span className={s.apBarBtns}>
              <button
                type="button" className="btn-primary btn-md" disabled={busy}
                onClick={() => act(() => completePurchaseRequest(req.id), '구매 완료로 바꿨습니다.')}
              >
                구매 완료
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
