// pages/process/manage/DailyClosePage.jsx
// 일일 마감 (2026-08-19) — 회전자 우선. 하루 생산분을 하나씩 확인하고 "오늘 끝" 을 남긴다.
//
// ★ 흐름: [마감 시작] → 오늘 항목 목록(공정 · Φ · 외전/내전 별 개수) → 하나씩 확인 → [마감 확정]
//   확인 체크는 화면 상태일 뿐이고, 확정 시 서버가 현재 목록과 다시 대조한다
//   (체크한 뒤 다른 사람이 LOT 을 더 발급했을 수 있다).
// ★ 숫자는 생산 현황 대시보드와 같은 집계를 쓴다 — 두 화면 숫자가 다르면 아무도 못 믿는다.
import { useCallback, useEffect, useState } from 'react'

import PageHeader from '@/components/common/PageHeader'
import { closeDay, getDailyCloseStatus, reopenDay } from '@/api'
import { useToast } from '@/contexts/ToastContext'
import { fmtKstDateTime } from '@/utils/dateConvert'

import s from './DailyClosePage.module.css'

export default function DailyClosePage({ onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [started, setStarted] = useState(false)     // '마감 시작' 을 눌렀는가
  const [checked, setChecked] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getDailyCloseStatus({})
      setData(r)
      setChecked(new Set())         // 목록이 바뀌었을 수 있다 — 확인은 처음부터 다시
      if (r.closed) setStarted(false)
    } catch (e) {
      toast(`조회 실패: ${e.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])
  useEffect(() => { load() }, [load])

  const items = data?.items || []
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
      await closeDay({ checked: [...checked] })
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
            {!data.closed && !started && (
              <div className={s.startBox}>
                <p className={s.startLead}>오늘 생산분</p>
                <p className={s.startNum}>{data.total_qty}<em>개</em></p>
                <p className={s.startSub}>{data.item_count}개 항목 · LOT {data.total_lots}건</p>
                <button type="button" className="btn-primary btn-lg btn-full"
                  disabled={items.length === 0} onClick={() => setStarted(true)}>
                  마감 시작
                </button>
                {items.length === 0 && <p className={s.empty}>오늘 생산 내역이 없습니다.</p>}
              </div>
            )}

            {/* ── 확인 중 ── */}
            {!data.closed && started && (
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
                    onClick={() => { setStarted(false); setChecked(new Set()) }}>
                    나가기
                  </button>
                  <button type="button" className="btn-primary btn-lg btn-full"
                    disabled={!allChecked || saving} onClick={confirm}>
                    {saving ? '마감 중…' : allChecked ? '마감 확정' : `${items.length - checked.size}개 남음`}
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
// 마감 완료 표시 — 그때 확인한 값(박제)을 그대로 보여준다.
//   지금 다시 계산한 값이 아니다. 마감 후 발급분이 생겨도 마감 기록은 안 흔들려야 한다.
// ══════════════════════════════════════════════════
function ClosedCard({ close, onCancel, busy }) {
  const snap = close?.snapshot || []
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
          {snap.map((it) => (
            <div key={it.key} className={s.snapRow}>
              <span>{it.label}</span>
              <b>{it.qty}개</b>
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
