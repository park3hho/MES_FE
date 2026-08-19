// pages/process/manage/DailyClosePage.jsx
// 일일 마감 (2026-08-19) — 회전자 우선. 하루 생산분을 하나씩 확인하고 "오늘 끝" 을 남긴다.
//
// ★ 흐름: [마감 시작] → 1단계 오늘 생산량 → 2단계 총 개수 → [마감 확정]
//   1단계 '오늘 생산량' = 오늘 만든 것(흐름) / 2단계 '총 개수' = 지금 쌓여 있는 재공품(잔량).
//   서로 다른 질문이라 화면도 나눈다 — 오늘 만든 게 맞아도 어제 것이 어긋나 있으면 재고는 틀린다.
//   확인 체크는 화면 상태일 뿐이고, 확정 시 서버가 현재 목록과 다시 대조한다
//   (체크한 뒤 다른 사람이 LOT 을 더 발급했을 수 있다).
// ★ 숫자는 생산 현황 대시보드와 같은 집계를 쓴다 — 두 화면 숫자가 다르면 아무도 못 믿는다.
import { useCallback, useEffect, useState } from 'react'

import PageHeader from '@/components/common/PageHeader'
import { closeDay, getDailyCloseStatus, reopenDay } from '@/api'
import { useToast } from '@/contexts/ToastContext'
import { fmtKstDateTime } from '@/utils/dateConvert'

import s from './DailyClosePage.module.css'

const STEPS = [
  { key: 'produce', label: '오늘 생산량' },
  { key: 'stock', label: '총 개수' },
]

export default function DailyClosePage({ onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('')              // '' = 시작 전 / produce / stock
  const [checked, setChecked] = useState(() => new Set())
  const [counts, setCounts] = useState({})          // { BO1: '12', BO2: '8' } — 현장이 센 수
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getDailyCloseStatus({})
      setData(r)
      setChecked(new Set())         // 목록이 바뀌었을 수 있다 — 확인은 처음부터 다시
      // 센 수의 기본값 = 시스템 수. 맞으면 그냥 넘기고, 다르면 그 자리에서 고친다.
      //   입력 단위는 모델 — 현장이 Φ·외전/내전 별로 쌓아 두므로 세는 단위도 그것이다.
      setCounts(Object.fromEntries(
        (r.stocks || []).flatMap((st) => (st.models || []).map((m) => [m.key, String(m.qty)])),
      ))
      if (r.closed) setStep('')
    } catch (e) {
      toast(`조회 실패: ${e.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])
  useEffect(() => { load() }, [load])

  const items = data?.items || []
  const stocks = data?.stocks || []
  const allChecked = items.length > 0 && items.every((x) => checked.has(x.key))

  const toggle = (key) => setChecked((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const confirm = async () => {
    if (!allChecked || saving) return
    setSaving(true)
    try {
      await closeDay({ checked: [...checked], counts })
      toast('오늘 마감 완료')
      await load()
    } catch (e) {
      toast(e.message, 'error')
      await load()                  // 409(목록 변경)면 최신 목록을 다시 보여준다
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
      <PageHeader title="일일 마감" subtitle="오늘 생산분을 확인하고 마감합니다 · 회전자" onBack={onBack} />
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

            {/* ── 시작 전 ── */}
            {!data.closed && !step && (
              <div className={s.startBox}>
                <p className={s.startLead}>오늘 생산분</p>
                <p className={s.startNum}>{data.total_qty}<em>개</em></p>
                <p className={s.startSub}>{data.item_count}개 항목 · LOT {data.total_lots}건</p>
                <button type="button" className="btn-primary btn-lg btn-full"
                  disabled={items.length === 0} onClick={() => setStep('produce')}>
                  마감 시작
                </button>
                {items.length === 0 && <p className={s.empty}>오늘 생산 내역이 없습니다.</p>}
              </div>
            )}

            {/* ── 단계 표시 ── */}
            {!data.closed && step && (
              <div className={s.steps}>
                {STEPS.map((st, i) => (
                  <span key={st.key}
                    className={`${s.stepChip} ${step === st.key ? s.stepOn : ''}`}>
                    <em>{i + 1}</em>{st.label}
                  </span>
                ))}
              </div>
            )}

            {/* ── 1단계: 오늘 생산량 ── */}
            {!data.closed && step === 'produce' && (
              <>
                <div className={s.progress}>
                  <span className={s.progLabel}>확인</span>
                  <b className={s.progNum}>{checked.size} / {items.length}</b>
                  <div className={s.bar}>
                    <div className={s.barFill}
                      style={{ width: `${items.length ? (checked.size / items.length) * 100 : 0}%` }} />
                  </div>
                </div>

                <div className={s.list}>
                  {items.map((it) => {
                    const on = checked.has(it.key)
                    return (
                      <button key={it.key} type="button"
                        className={`${s.item} ${on ? s.itemOn : ''}`}
                        aria-pressed={on} onClick={() => toggle(it.key)}>
                        <span className={`${s.check} ${on ? s.checkOn : ''}`} aria-hidden="true">
                          {on ? '✓' : ''}
                        </span>
                        <span className={s.itemBody}>
                          <span className={s.itemName}>{it.label}</span>
                          <span className={s.itemSub}>LOT {it.count}건</span>
                        </span>
                        <span className={s.itemQty}>{it.qty}<em>개</em></span>
                      </button>
                    )
                  })}
                </div>

                <div className={s.actions}>
                  <button type="button" className="btn-secondary btn-lg"
                    onClick={() => { setStep(''); setChecked(new Set()) }}>
                    나가기
                  </button>
                  <button type="button" className="btn-primary btn-lg btn-full"
                    disabled={!allChecked} onClick={() => setStep('stock')}>
                    {allChecked ? '다음 · 총 개수' : `${items.length - checked.size}개 남음`}
                  </button>
                </div>
              </>
            )}

            {/* ── 2단계: 총 개수 (지금 쌓여 있는 재공품) ── */}
            {!data.closed && step === 'stock' && (
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
                    onClick={() => setStep('produce')}>
                    이전
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
//   ★ 입력은 모델 단위, 단계 합계는 그 합이다. 현장이 모델별로 쌓아 두니 세는 단위도 그것이고,
//     단계 합계를 따로 입력받으면 모델 합과 어긋나 어느 쪽이 맞는지 알 수 없게 된다.
//   ★ 차이가 나도 막지 않는다. 막으면 현장은 실제 수 대신 시스템 수를 적게 된다.
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
// 마감 완료 표시 — 그때 확인한 값(박제)을 그대로 보여준다.
//   지금 다시 계산한 값이 아니다. 마감 후 발급분이 생겨도 마감 기록은 안 흔들려야 한다.
// ══════════════════════════════════════════════════
function ClosedCard({ close, onCancel, busy }) {
  const snap = close?.snapshot || []
  const stockSnap = close?.stock_snapshot || []
  return (
    <div className={s.doneBox}>
      <p className={s.doneMark}>오늘 마감 완료</p>
      <p className={s.doneMeta}>
        {fmtKstDateTime(close?.closed_at)}
        {close?.closed_by ? ` · ${close.closed_by}` : ''}
      </p>
      <div className={s.doneSum}>
        <span>{close?.item_count || 0}개 항목</span>
        <b>{close?.total_qty || 0}개</b>
      </div>
      {snap.length > 0 && (
        <div className={s.snapList}>
          <span className={s.snapCap}>오늘 생산량</span>
          {snap.map((it) => (
            <div key={it.key} className={s.snapRow}>
              <span>{it.label}</span>
              <b>{it.qty}개</b>
            </div>
          ))}
        </div>
      )}
      {stockSnap.length > 0 && (
        <div className={s.snapList}>
          <span className={s.snapCap}>총 개수</span>
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
