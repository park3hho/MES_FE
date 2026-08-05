// pages/process/produce/RotorBond2Flow.jsx
// 2차 본딩 (2026-07-30) — 1차 BO 에 2차 정보만 추가. 새 LOT·Print 없음.
//   흐름: 작업자 → 작업일 → BO 연속 스캔(다중). 스캔은 목록에 쌓기만 하고(잘못 스캔 삭제 가능),
//   "완료" 를 누를 때 목록 전체를 한꺼번에 rotorBond2 로 기록 (즉시 확정 방지, 2026-07-31).
//   OQ 는 2차 완료된 BO 만 검사 진입 허용(BE 하드 게이트).
import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import DatePickStep from '@/components/DatePickStep'
import FlowSteps from '@/components/FlowSteps'
import { rotorBond2, checkBond2 } from '@/api'
import { useDate } from '@/utils/useDate'
import { autoWorkerCode } from '@/constants/processConst'
import s from './RotorBond2Flow.module.css'

const pageVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir * -40 }),
}

const FLOW_LABELS = ['작업자', '작업일', 'BO 스캔']
const FLOW_INDEX = { worker: 0, date: 1, scan: 2, review: 2 }

export default function RotorBond2Flow({ user, onLogout, onBack }) {
  const today = useDate()
  const autoWorker = autoWorkerCode(user) || ''
  const [worker, setWorker] = useState(autoWorker)
  const [workDate, setWorkDate] = useState(today)
  // 스캔은 목록에 쌓기만 — [{lot, error}]. error = 직전 일괄 기록 실패 사유.
  const [pending, setPending] = useState([])
  const [doneLots, setDoneLots] = useState(() => new Set())   // 기록 완료된 BO — 재스캔 무시용
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState(null)
  // 작업자 자동입력(사람 계정)이면 작업자 스텝 건너뜀
  const [step, setStep] = useState(autoWorker ? 'date' : 'worker')
  const [direction, setDirection] = useState(1)

  const goTo = (next) => {
    const order = ['worker', 'date', 'scan', 'review']
    setDirection(order.indexOf(next) > order.indexOf(step) ? 1 : -1)
    setStep(next)
  }

  const flowIdx = FLOW_INDEX[step] ?? -1

  const checkingRef = useRef(new Set())   // 검증 진행중 LOT — 멀티프레임 중복 호출 차단
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600) }

  // 스캔 — 목록에 쌓기만. 세션 중복·기록완료는 조용히 무시, 서버 검증(존재·이미 2차완료)으로 잘못된 BO 거부.
  //   ★ 가드(2026-08-04): 이전엔 세션 내 중복만 막아 '이미 2차 완료된 BO'·'없는 BO'가 목록에 쌓였음
  //     → checkBond2 로 스캔 시점에 서버 검증. 무효면 토스트 + 목록에 안 담음.
  const addScan = async (val) => {
    const lot = (val || '').trim()
    if (!lot) return
    if (doneLots.has(lot)) return                  // 세션 내 기록완료 — 조용히 무시(멀티프레임)
    if (pending.some((x) => x.lot === lot)) return  // 이미 목록에 있음 — 조용히 무시
    if (checkingRef.current.has(lot)) return        // 같은 LOT 검증 진행중 — 중복 호출 무시
    checkingRef.current.add(lot)
    try {
      const r = await checkBond2({ lot_bo_no: lot })
      if (!r.ok) { showToast(r.reason || '스캔할 수 없는 BO 입니다.'); return }
      // setPending 콜백에서 재확인 — 검증 대기 사이 다른 스캔이 먼저 담았을 수 있음
      setPending((p) => (p.some((x) => x.lot === lot) ? p : [{ lot, error: null }, ...p]))
    } catch (e) {
      showToast(e.message || '검증에 실패했습니다.')
    } finally {
      checkingRef.current.delete(lot)
    }
  }

  const removeScan = (lot) => setPending((p) => p.filter((x) => x.lot !== lot))

  // 완료 — 목록 전체를 한꺼번에 2차 본딩 기록. 성공분은 목록에서 빼고 완료 처리, 실패분은 사유 달아 남김.
  const submitAll = async () => {
    if (!pending.length || submitting) return
    setSubmitting(true)
    const results = await Promise.allSettled(
      pending.map((p) => rotorBond2({ lot_bo_no: p.lot, worker, date: workDate })),
    )
    const stillPending = []
    const newlyDone = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') newlyDone.push(pending[i].lot)
      else stillPending.push({ lot: pending[i].lot, error: r.reason?.message || '기록 실패' })
    })
    if (newlyDone.length) {
      setDoneLots((s) => {
        const n = new Set(s)
        newlyDone.forEach((l) => n.add(l))
        return n
      })
    }
    setPending(stillPending)
    setSubmitting(false)
    setToast(
      stillPending.length
        ? `${newlyDone.length}건 기록 · ${stillPending.length}건 실패`
        : `${newlyDone.length}건 2차 본딩 기록 완료`,
    )
    setTimeout(() => setToast(null), 2600)
  }

  return (
    <AnimatePresence mode="wait" custom={direction}>
      {step === 'worker' && (
        <motion.div key="worker" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <div className="page-flat">
            <PageHeader title="2차 본딩 · 작업자" subtitle="2차 본딩 작업자 코드를 입력하세요" onBack={onBack} />
            <div className="process-content-inner">
              <FlowSteps steps={FLOW_LABELS} current={flowIdx} />
              <input type="text" inputMode="text" value={worker} autoFocus
                onChange={(e) => setWorker(e.target.value.trim())}
                onKeyDown={(e) => { if (e.key === 'Enter' && worker) goTo('date') }}
                placeholder="작업자 번호"
                style={{ width: '100%', padding: 14, fontSize: 18, textAlign: 'center', borderRadius: 8, border: '1.5px solid var(--color-border)', marginBottom: 16 }} />
              <button type="button" className="btn-primary btn-lg btn-full" disabled={!worker} onClick={() => goTo('date')}>다음</button>
            </div>
          </div>
        </motion.div>
      )}

      {step === 'date' && (
        <motion.div key="date" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <DatePickStep
            title="2차 본딩 · 작업일"
            subtitle="2차 본딩 작업 날짜를 선택하세요"
            today={today}
            value={workDate}
            onPick={(yy) => setWorkDate(yy || today)}
            topSlot={<FlowSteps steps={FLOW_LABELS} current={flowIdx} />}
            onNext={() => goTo('scan')}
            onBack={() => goTo(autoWorker ? 'worker' : 'worker')}
          />
        </motion.div>
      )}

      {step === 'scan' && (
        // ★ 전체화면 스캔 (2026-08-04) — 분할(bottomPanel) 모드가 iPhone 에서만 인식이 안 되는 이슈로
        //   다른 잘 되는 흐름과 동일한 풀스크린 구성으로 전환. 누적/완료는 배너 + 별도 확인(review) 스텝.
        <QRScanner
          key="scan"
          processLabel="2차 본딩 · BO 스캔"
          continuousScan
          banner={
            <div>
              <FlowSteps steps={FLOW_LABELS} current={flowIdx} />
              <p style={{ margin: 0 }}>
                2차 완료할 <strong>BO LOT</strong> 을 연속 스캔하세요
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <span style={{ fontSize: 13 }}>
                  대기 <strong>{pending.length}</strong>건
                  {doneLots.size > 0 && <> · 기록완료 {doneLots.size}건</>}
                </span>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={!pending.length}
                  onClick={() => goTo('review')}
                >
                  목록 확인 →
                </button>
              </div>
              {toast && <p style={{ margin: '6px 0 0', fontWeight: 600 }}>{toast}</p>}
            </div>
          }
          // 스캔은 목록에 쌓기만 — 확정(기록)은 review 스텝 '완료'에서 일괄. throw 안 함(연속 스캔 유지).
          onScan={(val) => { addScan(val) }}
          onLogout={onLogout}
          onBack={() => goTo('date')}
        />
      )}

      {step === 'review' && (
        <motion.div key="review" className="motion-wrap" custom={direction}
          variants={pageVariants} initial="enter" animate="center" exit="exit"
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
          <div className="page-flat">
            <PageHeader
              title="2차 본딩 · 확인"
              subtitle="스캔한 BO 목록을 확인하고 일괄 기록하세요"
              onBack={() => goTo('scan')}
            />
            <div className="process-content-inner">
              <FlowSteps steps={FLOW_LABELS} current={flowIdx} />
              {toast && <div className={s.toast}>{toast}</div>}
              <div className={s.panelHead}>
                <span className={s.count}>{pending.length}</span>
                <span className={s.countLabel}>건 대기</span>
                {doneLots.size > 0 && <span className={s.meta}>· 기록완료 {doneLots.size}건</span>}
                <span className={s.meta}>작업자 {worker} · {workDate}</span>
                <button
                  type="button"
                  className={`btn-primary ${s.doneBtn}`}
                  disabled={!pending.length || submitting}
                  onClick={submitAll}
                >
                  {submitting ? '기록 중…' : `완료 (${pending.length}건 기록)`}
                </button>
              </div>

              {pending.length === 0 ? (
                <p className={s.empty}>
                  {doneLots.size > 0
                    ? '대기 목록이 비었습니다 — 기록이 끝났어요. 더 스캔하려면 아래 버튼.'
                    : '아직 스캔한 LOT 이 없습니다 — 스캔 화면으로 돌아가 BO 라벨을 찍어주세요.'}
                </p>
              ) : (
                <>
                  <p className={s.listTitle}>스캔 대기 (최근순) · 잘못 스캔은 ✕ 로 삭제</p>
                  <ul className={s.list}>
                    {pending.map((r, i) => (
                      <li key={r.lot} className={s.item}>
                        <span className={s.idx}>{pending.length - i}</span>
                        <span className={s.lot}>{r.lot}</span>
                        {r.error && <span className={s.err}>✕ {r.error}</span>}
                        <button
                          type="button"
                          className={s.del}
                          onClick={() => removeScan(r.lot)}
                          aria-label="삭제"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <button
                type="button"
                className="btn-secondary btn-lg btn-full"
                style={{ marginTop: 16 }}
                onClick={() => goTo('scan')}
              >
                ← 더 스캔하기
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
