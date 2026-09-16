// src/pages/process/manage/PurchaseAssigneeModal.jsx
// 구매 의뢰 — 승인자·구매 담당 지정 + 계좌이체 인터넷뱅킹 주소 (2026-09-16)
//   ★ 여기 지정된 사람만 승인·구매 완료를 누를 수 있다(BE 가 판정). feature 가 아니라 이 목록이 권한이다.
//   ★ 네이버웍스 ID 가 없는 사람은 알림을 못 받으므로 그 자리에서 표시한다 — 지정해 놓고 안 가는 게 최악이다.
//   ★ 인터넷뱅킹 주소는 링크 없는(오프라인) 의뢰의 알림에 대신 실린다. 담당자가 DM 에서 바로 이체하러 가도록.
import { useState, useEffect } from 'react'

import {
  getPurchaseAssignees, listPurchaseAssigneeCandidates, savePurchaseAssignees,
} from '@/api'
import s from './PurchaseRequest.module.css'

const ROLES = [
  { key: 'approver', label: '승인자', desc: '의뢰를 승인·반려합니다' },
  { key: 'purchaser', label: '구매 담당', desc: '승인된 건을 사고 완료 처리합니다' },
]

export default function PurchaseAssigneeModal({ onClose, onSaved }) {
  const [picked, setPicked] = useState({ approver: [], purchaser: [] })
  const [cands, setCands] = useState([])
  const [banking, setBanking] = useState({ url: '', label: '인터넷뱅킹' })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const [d, list] = await Promise.all([
          getPurchaseAssignees(), listPurchaseAssigneeCandidates(),
        ])
        setPicked({
          approver: (d.approver || []).map((x) => x.machine_id),
          purchaser: (d.purchaser || []).map((x) => x.machine_id),
        })
        setBanking({
          url: d.setting?.banking_url || '',
          label: d.setting?.banking_label || '인터넷뱅킹',
        })
        setCands(list)
      } catch (e) {
        setMsg({ type: 'err', text: e.message })
      }
    })()
  }, [])

  const byId = (id) => cands.find((c) => c.machine_id === id)
  const add = (role, id) => {
    if (!id || picked[role].includes(id)) return
    setPicked({ ...picked, [role]: [...picked[role], id] })
  }
  const drop = (role, id) =>
    setPicked({ ...picked, [role]: picked[role].filter((x) => x !== id) })

  const save = async () => {
    if (picked.approver.length === 0) {
      return setMsg({ type: 'err', text: '승인자를 한 명 이상 지정해주세요. 없으면 아무도 의뢰를 제출할 수 없습니다.' })
    }
    setBusy(true); setMsg(null)
    try {
      await savePurchaseAssignees({
        approver: picked.approver,
        purchaser: picked.purchaser,
        banking_url: banking.url.trim(),
        banking_label: banking.label.trim() || '인터넷뱅킹',
      })
      onSaved?.()
    } catch (e) {
      setMsg({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={s.modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <div>
            <h3 className={s.modalTitle}>승인자 · 구매 담당</h3>
            <p className={s.modalSub}>여기 지정된 사람만 승인과 구매 완료를 누를 수 있습니다</p>
          </div>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <div className={s.modalBody}>
          {msg && <p className={s.msgErr}>{msg.text}</p>}
          {picked.purchaser.length === 0 && (
            <p className={s.warnBox}>
              구매 담당이 없으면 승인 뒤에 아무에게도 알림이 가지 않습니다. 한 명 이상 지정하세요.
            </p>
          )}

          {ROLES.map((role) => (
            <div key={role.key}>
              <p className={s.subLabel}>{role.label} <span className={s.hint}>{role.desc}</span></p>
              {picked[role.key].map((id) => {
                const c = byId(id)
                const name = c?.name || `계정#${id}`
                return (
                  <div key={id} className={s.person}>
                    <span className={s.avatar}>{name.slice(0, 2)}</span>
                    <span className={s.personName}>
                      {name}
                      {c && !c.has_nw && <span className={s.noNw}>네이버웍스 ID 없음 · 알림 못 받음</span>}
                    </span>
                    <button
                      type="button" className="btn-ghost btn-sm"
                      onClick={() => drop(role.key, id)}
                    >
                      해제
                    </button>
                  </div>
                )
              })}
              <select
                className="form-input"
                value=""
                onChange={(e) => add(role.key, Number(e.target.value))}
              >
                <option value="">사람 추가...</option>
                {cands
                  .filter((c) => !picked[role.key].includes(c.machine_id))
                  .map((c) => (
                    <option key={c.machine_id} value={c.machine_id}>
                      {c.name}{c.has_nw ? '' : ' (알림 불가)'}
                    </option>
                  ))}
              </select>
            </div>
          ))}

          <p className={s.subLabel}>
            계좌이체 인터넷뱅킹 주소
            <span className={s.hint}> 구매 링크가 없는 의뢰의 알림에 대신 실립니다</span>
          </p>
          <div className={s.field}>
            <input
              className="form-input"
              placeholder="https://"
              value={banking.url}
              onChange={(e) => setBanking({ ...banking, url: e.target.value })}
            />
            <p className={s.hint}>표시 이름</p>
            <input
              className="form-input"
              placeholder="인터넷뱅킹"
              value={banking.label}
              onChange={(e) => setBanking({ ...banking, label: e.target.value })}
            />
          </div>
        </div>

        <div className={s.actions}>
          <button type="button" className="btn-secondary" onClick={onClose}>닫기</button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy}>
            {busy ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
