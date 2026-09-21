// src/pages/process/manage/PurchaseRequestDetailPage.jsx
// 구매 의뢰 — 상세 · 결재 (2026-09-16)
//   ★ 같은 화면을 의뢰자·승인자·구매 담당이 함께 본다. 하단 버튼만 상태와 자격에 따라 바뀐다.
//     화면을 나누면 알림 링크가 어디로 가야 할지 갈라져서 결국 다시 합치게 된다.
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
  const canApprove = req.status === 'submitted' && meta?.is_approver
  const canBuy = req.status === 'approved' && meta?.is_purchaser

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
          {req.req_no} · {req.requester_name || '-'} · {fmtWhen(req.created_at)}
          {' '}
          <span className={`${s.badge} ${BADGE[req.status] || ''}`}>
            {LABEL[req.status] || req.status}
          </span>
        </p>

        <div className={s.two}>
          <div>
            {/* 용도 → 결제 조건 → 링크 → 메모 순. 승인자가 보는 순서대로 */}
            {req.purpose && <p className={s.purpose}>용도 · {req.purpose}</p>}
            {req.pay_type_label && (
              <p className={s.payTag}>
                {req.pay_type_label}
                {req.transfer_scope_label ? ` · ${req.transfer_scope_label}` : ''}
                {req.pay_timing_label ? ` · ${req.pay_timing_label}` : ''}
              </p>
            )}
            {req.account_no && (
              <p className={s.block}>
                입금 계좌 · {req.account_bank} {req.account_no}
                {req.account_holder ? ` / ${req.account_holder}` : ''}
                {/* 해외송금 — 국내 건은 빈 문자열이라 줄이 통째로 빠진다 (2026-09-21).
                    수취인 / 지급은행을 줄로 나눈다 — 나라가 다를 수 있어 한 줄에 섞으면 누구 것인지 모른다.
                    라벨은 은행 송금 화면 용어 그대로(봇 DM 과 같다). */}
                {(req.payee_country || req.payee_city || req.payee_addr) && (
                  <><br />수취인 · {[nation(req.payee_country), req.payee_city, req.payee_addr]
                    .filter(Boolean).join(' · ')}</>
                )}
                {(req.bank_country || req.bank_swift || req.bank_addr) && (
                  <><br />지급은행 · {[nation(req.bank_country),
                    req.bank_swift && `SWIFT ${req.bank_swift}`, req.bank_addr]
                    .filter(Boolean).join(' · ')}</>
                )}
              </p>
            )}
            {req.link && (
              <a className={s.link} href={req.link} target="_blank" rel="noopener noreferrer">
                {req.platform || '구매처'} 에서 보기 ↗
              </a>
            )}
            {req.memo && <p className={s.block}>{req.memo}</p>}

            <label className={s.label}>진행</label>
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
                <label className={s.label}>연결된 구매 검수</label>
                {req.records.map((rec) => (
                  <p key={rec.id} className={s.block}>
                    {rec.insp_no ? `${rec.insp_no} · ` : ''}{rec.title} · {rec.purchased_at || ''}
                  </p>
                ))}
              </>
            )}
          </div>

          <div>
            {shots.length > 0 && (
              <>
                <label className={s.label}>스크린샷 {shots.length}장</label>
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
                <label className={s.label}>파일 {docs.length}개</label>
                <div className={s.files}>
                  {docs.map((f) => (
                    <div key={f.id} className={s.file}>
                      <span className={s.fileIcon}>{ext(f.filename)}</span>
                      <span className={s.fileName}>{f.filename}</span>
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
                <label className={s.label}>드라이브 업로드 {nwBad.length}건</label>
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

        {(canApprove || canBuy) && (
          <div className={s.actions}>
            {canApprove && !rejecting && (
              <>
                <button
                  type="button" className="btn-danger" disabled={busy}
                  onClick={() => setRejecting(true)}
                >
                  반려
                </button>
                <button
                  type="button" className="btn-primary" disabled={busy}
                  onClick={() => act(() => approvePurchaseRequest(req.id), '승인했습니다.')}
                >
                  승인
                </button>
              </>
            )}
            {canApprove && rejecting && (
              <>
                <button
                  type="button" className="btn-secondary" disabled={busy}
                  onClick={() => { setRejecting(false); setComment('') }}
                >
                  취소
                </button>
                <button
                  type="button" className="btn-danger" disabled={busy || !comment.trim()}
                  onClick={() => act(() => rejectPurchaseRequest(req.id, comment.trim()), '반려했습니다.')}
                >
                  반려하기
                </button>
              </>
            )}
            {canBuy && (
              <button
                type="button" className="btn-primary" disabled={busy}
                onClick={() => act(() => completePurchaseRequest(req.id), '구매 완료로 바꿨습니다.')}
              >
                구매 완료
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
