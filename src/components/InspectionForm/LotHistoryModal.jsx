// components/InspectionForm/LotHistoryModal.jsx
// OQ 검사 입력 중 "이 제품이 어디서 왔나?" 간단 확인용 팝업 (2026-04-24)
// - (i) 버튼 클릭 시 열림
// - traceLot(SO 번호) 호출 → 재료 체인 / 수리 이력 요약
// - 하단 "상세 이력 전체 보기" → TracePage 로 이동 (그녀석이 담당)

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { traceLot } from '@/api'
import s from './LotHistoryModal.module.css'

const CHAIN_KEYS = ['rm', 'mp', 'ea', 'ht', 'bo', 'ec', 'wi', 'so']
const CHAIN_LABELS = {
  rm: 'RM · 원자재', mp: 'MP · 자재', ea: 'EA · 낱장',
  ht: 'HT · 열처리', bo: 'BO · 본딩', ec: 'EC · 전착',
  wi: 'WI · 권선', so: 'SO · 중성점',
}

export default function LotHistoryModal({ lotSoNo, open, onClose }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open || !lotSoNo) return
    let cancelled = false
    setLoading(true)
    setError(null)
    traceLot(lotSoNo)
      .then((r) => { if (!cancelled) setData(r) })
      .catch((e) => { if (!cancelled) setError(e.message || '조회 실패') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, lotSoNo])

  if (!open) return null

  // 체인 추출 — scanned entity 의 upstream 엔티티들에서 lot_no 수집 + 자기 자신 포함
  const chain = {}
  if (data?.entities && data?.lot_no) {
    const self = data.entities[data.lot_no]
    if (self) chain[String(self.process || '').toLowerCase()] = self.lot_no
    for (const item of data.upstream_chain || []) {
      chain[String(item.process || '').toLowerCase()] = item.lot_no
    }
    // from_lots 도 보조로 채움 (예: lot_rm_no, lot_mp_no ...)
    if (self?.from_lots) {
      for (const [k, v] of Object.entries(self.from_lots)) {
        if (!v) continue
        // lot_rm_no → 'rm'
        const key = k.replace(/^lot_/, '').replace(/_no$/, '')
        if (CHAIN_KEYS.includes(key) && !chain[key]) chain[key] = v
      }
    }
  }

  const selfEntity = data?.entities?.[data?.lot_no] || null
  const repairOut = selfEntity?.repaired_out
  const repairFrom = selfEntity?.repaired_from
  const replacementLot = selfEntity?.replacement_lot_no
  const repairSuffix = selfEntity?.repair_suffix
  const repairReason = selfEntity?.repair_reason

  const openTracePage = () => {
    onClose?.()
    navigate('/admin/trace', { state: { lotNo: lotSoNo } })
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <div>
            <h3 className={s.title}>LOT 이력</h3>
            <p className={s.subtitle}>{lotSoNo}</p>
          </div>
          <button type="button" className={s.closeBtn} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className={s.body}>
          {loading && <p className={s.muted}>불러오는 중…</p>}
          {error && <p className={s.err}>⚠ {error}</p>}

          {!loading && !error && data && (
            <>
              {/* 재료 체인 */}
              <section className={s.section}>
                <h4 className={s.sectionTitle}>재료 체인</h4>
                <ul className={s.chainList}>
                  {CHAIN_KEYS.map((k) => (
                    <li key={k} className={s.chainRow}>
                      <span className={s.chainLabel}>{CHAIN_LABELS[k]}</span>
                      <span className={chain[k] ? s.chainVal : s.chainEmpty}>
                        {chain[k] || '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              {/* 수리 이력 */}
              {(repairOut || repairFrom) && (
                <section className={s.section}>
                  <h4 className={s.sectionTitle}>수리 이력</h4>
                  {repairOut && (
                    <div className={`${s.repairBox} ${s.repairOrigin}`}>
                      <div className={s.repairHead}>🔧 수리 원본</div>
                      {repairSuffix && <div>문제 공정: <b>{repairSuffix}</b></div>}
                      {repairReason && <div>사유: {repairReason}</div>}
                      {replacementLot && (
                        <div>교체품: <b>{replacementLot}</b></div>
                      )}
                    </div>
                  )}
                  {repairFrom && (
                    <div className={`${s.repairBox} ${s.repairReplacement}`}>
                      <div className={s.repairHead}>♻️ 수리 교체품</div>
                      <div>원본: <b>{repairFrom}</b></div>
                      {repairSuffix && <div>문제 공정: <b>{repairSuffix}</b></div>}
                      {repairReason && <div>사유: {repairReason}</div>}
                    </div>
                  )}
                </section>
              )}

              {/* 현재 상태 */}
              {selfEntity && (
                <section className={s.section}>
                  <h4 className={s.sectionTitle}>현재 상태</h4>
                  <div className={s.statusRow}>
                    <span>상태: <b>{selfEntity.status || '-'}</b></span>
                    {selfEntity.quantity != null && selfEntity.quantity > 0 && (
                      <span>수량: <b>{selfEntity.quantity}</b></span>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className={s.footer}>
          <button type="button" className="btn-secondary btn-md" onClick={onClose}>
            닫기
          </button>
          <button type="button" className="btn-primary btn-md" onClick={openTracePage}>
            상세 이력 전체 보기 →
          </button>
        </div>
      </div>
    </div>
  )
}
