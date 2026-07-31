// pages/process/produce/RotorBond2Flow.jsx
// 2차 본딩 (2026-07-30) — 1차 BO 에 2차 정보만 추가. 새 LOT·Print 없음.
//   흐름: 작업자 → 작업일 → BO 연속 스캔(다중). 스캔마다 rotorBond2 기록(이미 2차면 409 → 스캔 거부).
//   OQ 는 2차 완료된 BO 만 검사 진입 허용(BE 하드 게이트).
import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import DatePickStep from '@/components/DatePickStep'
import FlowSteps from '@/components/FlowSteps'
import { rotorBond2 } from '@/api'
import { useDate } from '@/utils/useDate'
import { autoWorkerCode, MOTOR_LABEL } from '@/constants/processConst'
import s from './RotorBond2Flow.module.css'

const pageVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir * -40 }),
}

const FLOW_LABELS = ['작업자', '작업일', 'BO 스캔']
const FLOW_INDEX = { worker: 0, date: 1, scan: 2 }

export default function RotorBond2Flow({ user, onLogout, onBack }) {
  const today = useDate()
  const autoWorker = autoWorkerCode(user) || ''
  const [worker, setWorker] = useState(autoWorker)
  const [workDate, setWorkDate] = useState(today)
  const [recorded, setRecorded] = useState([])          // [{lot, phi, motor}]
  // 작업자 자동입력(사람 계정)이면 작업자 스텝 건너뜀
  const [step, setStep] = useState(autoWorker ? 'date' : 'worker')
  const [direction, setDirection] = useState(1)

  const goTo = (next) => {
    const order = ['worker', 'date', 'scan']
    setDirection(order.indexOf(next) > order.indexOf(step) ? 1 : -1)
    setStep(next)
  }

  const flowIdx = FLOW_INDEX[step] ?? -1

  // 종류별 집계 — 2차 본딩은 파이/모터 제한이 없어 섞어 스캔해도 되므로(BE bond2_record 는
  //   LOT 존재·미완료만 검사) "무엇이 몇 개인지" 를 따로 보여줘야 확인이 된다.
  const byKind = useMemo(() => {
    const m = new Map()
    for (const r of recorded) {
      const key = `${r.phi ?? '-'}|${r.motor ?? '-'}`
      m.set(key, (m.get(key) || 0) + 1)
    }
    return [...m.entries()]
      .map(([key, n]) => {
        const [phi, motor] = key.split('|')
        return { key, phi, motor, n }
      })
      .sort((a, b) => b.n - a.n || a.phi.localeCompare(b.phi))
  }, [recorded])

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
        <QRScanner
          key="scan"
          processLabel="2차 본딩 · BO 스캔"
          // 배너는 '지금 뭘 해야 하는지'만 — 누적 결과는 아래 패널로 (2026-07-30)
          banner={
            <div>
              <FlowSteps steps={FLOW_LABELS} current={flowIdx} />
              <p style={{ margin: 0 }}>
                2차 완료할 <strong>BO LOT</strong> 을 연속 스캔하세요
              </p>
            </div>
          }
          // 하단 패널 — 스캔한 항목·총 개수·종류 (파이가 달라도 섞어 스캔 가능)
          bottomPanel={
            <div>
              <div className={s.panelHead}>
                <span className={s.count}>{recorded.length}</span>
                <span className={s.countLabel}>건 기록됨</span>
                <span className={s.meta}>작업자 {worker} · {workDate} · Print 없음</span>
                <button type="button" className={`btn-primary ${s.doneBtn}`} onClick={onBack}>
                  완료
                </button>
              </div>

              {byKind.length > 0 && (
                <div className={s.chips}>
                  {byKind.map((k) => (
                    <span key={k.key} className={s.chip}>
                      Φ{k.phi} {MOTOR_LABEL[k.motor] || k.motor} <b className={s.chipNum}>{k.n}</b>
                    </span>
                  ))}
                </div>
              )}

              {recorded.length === 0 ? (
                <p className={s.empty}>아직 스캔한 LOT 이 없습니다 — 위 카메라로 BO 라벨을 찍어주세요.</p>
              ) : (
                <>
                  <p className={s.listTitle}>스캔 목록 (최근순)</p>
                  <ul className={s.list}>
                    {recorded.map((r, i) => (
                      <li key={r.lot} className={s.item}>
                        <span className={s.idx}>{recorded.length - i}</span>
                        <span className={s.lot}>{r.lot}</span>
                        <span className={s.spec}>Φ{r.phi} {MOTOR_LABEL[r.motor] || r.motor}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          }
          // 스캔마다 2차 기록. 이미 2차/미존재면 throw → QRScanner 가 스캔 거부(에러 표시).
          //   연속 스캔이라 같은 라벨이 여러 프레임 잡힘 — 방금 기록한 LOT 재발화는 조용히 무시(409 스팸 방지).
          onScan={async (val) => {
            if (recorded.some((r) => r.lot === val)) return
            const res = await rotorBond2({ lot_bo_no: val, worker, date: workDate })
            setRecorded((r) => [{ lot: val, phi: res.phi, motor: res.motor_type }, ...r])
          }}
          onLogout={onLogout}
          onBack={() => goTo('date')}
        />
      )}
    </AnimatePresence>
  )
}
