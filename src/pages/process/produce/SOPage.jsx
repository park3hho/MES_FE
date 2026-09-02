// pages/process/produce/SOPage.jsx
// SO 중성점 — 고정자 라인의 작업일지 첫 공정 (2026-09-02).
//   작업일 STEP 은 회전자(REA/RBO)와 **같은 DatePickStep** 을 쓴다. line='고정자' 만 다르다.
//   공정별 디테일(이상치 경고 기준 등) 미세조정은 나중 — 지금은 재사용이 목적.
import { useState } from 'react'
import { printLot, scanLot } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import DatePickStep from '@/components/DatePickStep'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import { useDate } from '@/utils/useDate'
import { workTimeBody } from '@/utils/workTime'
import { SO_STEPS, autoWorkerCode, LINE_STATOR } from '@/constants/processConst'
export default function SOPage({ user, onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [lotNo, setLotNo] = useState(null)
  const [selections, setSelections] = useState(null)
  const [overrideDate, setOverrideDate] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')
  // 작업일지 구간 — DatePickStep 이 서버 제안으로 채우고 작업자가 고친다 (2026-09-02)
  const [workTime, setWorkTime] = useState({ start: '', end: '' })

  const effectiveDate = overrideDate || date

  // shape 고정(SM) + 작업자 자동입력이면 선택기가 물을 게 하나도 없어 마운트 즉시 제출된다.
  //   그 상태에서 작업일의 뒤로가기를 selector 로 보내면 곧바로 되돌아와 QR 로 못 가는 덫이 된다.
  const workerAuto = autoWorkerCode(user)

  const handleMaterialSubmit = (sel) => {
    setSelections(sel)
    setLotNo(`${sel.shape}${sel.worker}${effectiveDate}`)
    setStep('date_pick')
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLot(lotNo, quantity, {
        selected_process: 'SO', lot_chain: lotChain, prev_lot_no: prevLotNo,
        override_date: overrideDate || undefined, ...selections,
        ...workTimeBody(workTime),   // 작업일지 구간 (미지정이면 BE 자동 추정)
      })
      setDone(true)
    } catch (e) { setError(e.message) } finally { setPrinting(false) }
  }

  const handleReset = () => {
    setLotNo(null); setSelections(null); setQuantity(null); setOverrideDate(null)
    setPrinting(false); setDone(false); setError(null)
    setLotChain(null); setPrevLotNo(null); setWorkTime({ start: '', end: '' }); setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  return (
    <>
      {step === 'qr' && (
        <QRScanner key={step} processLabel="SO, 중성점"
          onScan={async (val) => {
            const r = await scanLot('SO', val)
            setPrevLotNo(r.prev_lot_no); setLotChain(r.lot_chain); setQuantity(r.quantity)
            setStep('selector')
          }}
          onLogout={onLogout} onBack={onBack} />
      )}
      {step === 'selector' && (
        // shape='SM' 고정 (2026-09-02) — 당분간 수동 납땜만 한다. autoValues 에 넣으면
        //   MaterialSelector 가 그 단계를 건너뛰고 결과에 병합한다(작업자 자동입력과 같은 경로).
        //   자동(SA) 납땜을 재개하면 이 키만 빼면 선택 화면이 그대로 돌아온다.
        <MaterialSelector steps={SO_STEPS} autoValues={{ shape: 'SM', date: effectiveDate, seq: '00', worker: workerAuto }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null} />
      )}
      {/* 작업일 + 작업시간·정지 — 회전자(REA/RBO)와 같은 공용 STEP. line 만 고정자 (2026-09-02).
          onWorkTime 을 넘기므로 작업시간·정지 영역이 함께 켜진다. */}
      {step === 'date_pick' && (
        <DatePickStep
          today={date}
          value={effectiveDate}
          onPick={(yy) => {
            setOverrideDate(yy)
            if (selections) setLotNo(`${selections.shape}${selections.worker}${yy || date}`)
          }}
          lotPreview={`${lotNo}-00`}
          workTime={workTime}
          onWorkTime={setWorkTime}
          worker={selections?.worker || workerAuto || ''}
          line={LINE_STATOR}
          onNext={() => setStep('confirm')}
          onBack={() => setStep(workerAuto ? 'qr' : 'selector')}
        />
      )}
      {step === 'confirm' && (
        <ConfirmModal lotNo={`${lotNo}-00`} printCount={quantity}
          printing={printing} done={done} error={error}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}
