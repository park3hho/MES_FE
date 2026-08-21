// pages/process/manage/DailyClosePage.jsx
// 일일 마감 (2026-08-19) — 회전자. 하루 끝에 재공품 총 개수를 실물과 맞춰 보고 "오늘 끝" 을 남긴다.
//
// ★ 흐름: [마감 시작] → 총 개수(BO1/BO2 × 모델별 실사) → [마감 확정]
//   (2026-08-20 단순화: '오늘 생산량 확인' 단계 제거 — 소급 발급 때문에 '오늘 발급분' 집계가
//    현장 감각과 어긋났고, 생산량은 생산 현황 대시보드 몫. 마감의 고유 가치는 실물 대조뿐.)
// ★ 센 수의 기본값 = 시스템 수. 맞으면 그대로 확정, 다르면 그 자리에서 고친다.
//   차이가 나도 막지 않는다 — 막으면 현장은 실제 수 대신 시스템 수를 적게 된다.
import { useCallback, useEffect, useState } from 'react'

import PageHeader from '@/components/common/PageHeader'
import { closeDay, getDailyCloseStatus, reopenDay } from '@/api'
import { useToast } from '@/contexts/ToastContext'
import { fmtKstDateTime } from '@/utils/dateConvert'

import s from './DailyClosePage.module.css'

export default function DailyClosePage({ onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [started, setStarted] = useState(false)
  const [counts, setCounts] = useState({})          // { "BO1|45|outer": '12', … } — 현장이 센 수
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getDailyCloseStatus({})
      setData(r)
      // 센 수의 기본값 = 시스템 수. 입력 단위는 모델 — 현장이 Φ·외전/내전 별로 쌓아 두므로.
      setCounts(Object.fromEntries(
        (r.stocks || []).flatMap((st) => (st.models || []).map((m) => [m.key, String(m.qty)])),
      ))
      if (r.closed) setStarted(false)
    } catch (e) {
      toast(`조회 실패: ${e.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])
  useEffect(() => { load() }, [load])

  const stocks = data?.stocks || []

  const confirm = async () => {
    if (saving) return
    setSaving(true)
    try {
      await closeDay({ counts })
      toast('오늘 마감 완료')
      await load()
    } catch (e) {
      toast(e.message, 'error')
      await load()
    } finally {
      setSaving(false)
    }
  }

  const cancel = async () => {
    setSaving(true)
    try {
      await reopenDay({})
      toast('마감을 취소했습니다')
      await load()
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-flat">
      <PageHeader title="일일 마감" subtitle="재공품 총 개수를 확인하고 마감합니다 · 회전자" onBack={onBack} />
      <div className="process-content-inner">
        {loading && <p className={s.info}>불러오는 중…</p>}

        {!loading && data && (
          <>
            <div className={s.dateBox}>
              <span className={s.dateVal}>{data.date}</span>
              <span className={s.lineTag}>{data.line}</span>
            </div>

            {/* ── 마감 완료 ── */}
            {data.closed && <ClosedCard close={data.close} onCancel={cancel} busy={saving} />}

            {/* ── 시작 전 — 현재 재공품 총합만 크게 ── */}
            {!data.closed && !started && (
              <div className={s.startBox}>
                <p className={s.startLead}>현재 재공품 (본딩)</p>
                <p className={s.startNum}>{data.stock_total}<em>개</em></p>
                <p className={s.startSub}>{data.model_count}개 모델 · BO1 / BO2</p>
                <button type="button" className="btn-primary btn-lg btn-full"
                  onClick={() => setStarted(true)}>
                  마감 시작
                </button>
              </div>
            )}

            {/* ── 총 개수 실사 ── */}
            {!data.closed && started && (
              <>
                <p className={s.stockLead}>
                  지금 남아 있는 재공품 수입니다. 모델별로 세어 실물과 다르면 고쳐 주세요.
                </p>
                <div className={s.stockList}>
                  {stocks.map((st) => (
                    <StockStage key={st.key} stock={st} counts={counts}
                      onChange={(k, v) => setCounts((p) => ({ ...p, [k]: v }))} />
                  ))}
                </div>

                <div className={s.actions}>
                  <button type="button" className="btn-secondary btn-lg"
                    onClick={() => setStarted(false)}>
                    나가기
                  </button>
                  <button type="button" className="btn-primary btn-lg btn-full"
                    disabled={saving} onClick={confirm}>
                    {saving ? '마감 중…' : '마감 확정'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════
// 총 개수 — 단계(BO1/BO2) 안에 모델(Φ · 외전/내전) 행.
//   ★ 입력은 모델 단위, 단계 합계는 그 합이다. 단계 합계를 따로 받으면 모델 합과
//     어긋났을 때 어느 쪽이 맞는지 알 수 없게 된다.
// ══════════════════════════════════════════════════
const num = (v, fallback) => (Number.isNaN(parseInt(v, 10)) ? fallback : parseInt(v, 10))

function StockStage({ stock, counts, onChange }) {
  const models = stock.models || []
  const counted = models.reduce((n, m) => n + num(counts[m.key], m.qty), 0)
  const diff = counted - stock.qty

  return (
    <div className={s.stage}>
      <div className={s.stageHead}>
        <span className={s.itemBody}>
          <span className={s.itemName}>{stock.label}</span>
          <span className={s.itemSub}>{stock.sub} · 시스템 {stock.qty}개</span>
        </span>
        <span className={`${s.stageSum} ${diff ? s.stageBad : ''}`}>
          {counted}<em>개</em>
          {diff !== 0 && <b className={s.diffTag}>{diff > 0 ? `+${diff}` : diff}</b>}
        </span>
      </div>

      {models.length === 0 && <p className={s.stageEmpty}>남아 있는 재공품이 없습니다.</p>}
      {models.map((m) => {
        const v = counts[m.key] ?? String(m.qty)
        const d = num(v, m.qty) - m.qty
        return (
          <div key={m.key} className={`${s.modelRow} ${d ? s.stockDiff : ''}`}>
            <span className={s.modelName}>{m.label}</span>
            <span className={s.modelSys}>시스템 {m.qty}</span>
            {d !== 0 && <span className={s.diffTag}>{d > 0 ? `+${d}` : d}</span>}
            <input type="number" inputMode="numeric" min="0" className={s.countInput}
              aria-label={`${stock.label} ${m.label} 센 수`}
              value={v} onChange={(e) => onChange(m.key, e.target.value)} />
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════
// 마감 완료 — 그때 확인한 값(박제)을 그대로 보여준다. 지금 다시 계산한 값이 아니다.
// ══════════════════════════════════════════════════
function ClosedCard({ close, onCancel, busy }) {
  const stockSnap = close?.stock_snapshot || []
  return (
    <div className={s.doneBox}>
      <p className={s.doneMark}>오늘 마감 완료</p>
      <p className={s.doneMeta}>
        {fmtKstDateTime(close?.closed_at)}
        {close?.closed_by ? ` · ${close.closed_by}` : ''}
      </p>
      <div className={s.doneSum}>
        <span>재공품</span>
        <b>{close?.total_qty || 0}개</b>
      </div>
      {stockSnap.length > 0 && (
        <div className={s.snapList}>
          {stockSnap.map((it) => (
            <div key={it.key}>
              <div className={s.snapRow}>
                <span>{it.label}</span>
                <b>
                  {it.counted}개
                  {it.diff ? <em className={s.snapDiff}> (시스템 {it.qty})</em> : null}
                </b>
              </div>
              {(it.models || []).map((m) => (
                <div key={m.key} className={`${s.snapRow} ${s.snapSub}`}>
                  <span>{m.label}</span>
                  <b>
                    {m.counted}개
                    {m.diff ? <em className={s.snapDiff}> (시스템 {m.qty})</em> : null}
                  </b>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn-secondary btn-md" disabled={busy} onClick={onCancel}>
        마감 취소
      </button>
    </div>
  )
}
