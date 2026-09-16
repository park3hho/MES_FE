// src/pages/process/manage/PurchaseRequestDetailPage.jsx
// 구매 의뢰 — 상세 · 결재 (2026-09-16)
//   ★ 같은 화면을 의뢰자·승인자·구매 담당이 함께 본다. 하단 버튼만 상태와 자격에 따라 바뀐다.
//     화면을 나누면 알림 링크가 어디로 가야 할지 갈라져서 결국 다시 합치게 된다.
//   ★ 반려는 사유가 필수다(BE 가 422 로 막는다) — 화면에서도 비어 있으면 못 누르게 한다.
//   ★ 첨부 미리보기는 presigned URL 이라 만료된다(10분). 새로 열면 다시 받는다.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import {
  getPurchaseRequest, getPurchaseRequestMeta, getPurchaseRequestFileUrl,
  approvePurchaseRequest, rejectPurchaseRequest, completePurchaseRequest,
} from '@/api'
import { BADGE, fmtWhen } from './PurchaseRequestPage'
import s from './PurchaseRequest.module.css'

const LABEL = {
  submitted: '승인 대기', approved: '승인됨', purchased: '구매 완료', rejected: '반려',
}
const ext = (name) => (name?.includes('.') ? name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE')

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
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    }
  }, [reqId])
  useEffect(() => { load() }, [load])

  const openFile = async (f) => {
    try {
      const url = await getPurchaseRequestFileUrl(f.id, false)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
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
            {/* 결제 조건 — 승인 판단의 핵심이라 링크·메모보다 위에 둔다 */}
            {req.pay_type_label && (
              <p className={s.payTag}>
                {req.pay_type_label}
                {req.pay_timing_label ? ` · ${req.pay_timing_label}` : ''}
              </p>
            )}
            {req.account_no && (
              <p className={s.block}>
                입금 계좌 · {req.account_bank} {req.account_no}
                {req.account_holder ? ` / ${req.account_holder}` : ''}
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
                <label className={s.label}>연결된 구매 증빙</label>
                {req.records.map((rec) => (
                  <p key={rec.id} className={s.block}>{rec.title} · {rec.purchased_at || ''}</p>
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
