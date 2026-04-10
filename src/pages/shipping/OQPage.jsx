import { useState } from 'react'
import { printLot, scanLot, submitTest1, submitTest2, printStLabel, getTestStatus } from '@/api'
import { useAutoReset } from '@/hooks/useAutoReset'
import MaterialSelector from '@/components/MaterialSelector'
import { ConfirmModal } from '@/components/ConfirmModal'
import QRScanner from '@/components/QRScanner'
import InspectionForm from '@/components/InspectionForm'
import { FaradayLogo } from '@/components/FaradayLogo'
import { useDate } from '@/utils/useDate'
import { OQ_STEPS } from '@/constants/processConst'

export default function OQPage({ onLogout, onBack }) {
  const date = useDate()
  const [prevLotNo, setPrevLotNo] = useState(null)
  const [lotChain, setLotChain] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [phi, setPhi] = useState('')
  const [motorType, setMotorType] = useState('')
  const [lotNo, setLotNo] = useState(null)
  const [actualOqNo, setActualOqNo] = useState('') // 실제 채번된 OQ LOT
  const [selections, setSelections] = useState(null)
  const [inspectionData, setInspectionData] = useState(null)
  const [doneMsg, setDoneMsg] = useState('')
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)
  const [step, setStep] = useState('qr')

  // 테스트 상태
  const [testStatus, setTestStatus] = useState(null)
  const [selectedTest, setSelectedTest] = useState(null)
  const [isFirstTest, setIsFirstTest] = useState(true)

  // 1) QR 스캔
  const handleScan = async (val) => {
    const r = await scanLot('OQ', val)
    setPrevLotNo(r.prev_lot_no)
    setLotChain(r.lot_chain)
    setQuantity(r.quantity)
    setPhi(r.spec || '')
    setMotorType(r.motor_type || '')
    setStep('selector')
  }

  // 2) 작업자 선택 → 테스트 상태 확인
  const handleMaterialSubmit = async (sel) => {
    setSelections(sel)
    setLotNo(`OQ${sel.worker}${date}`)
    try {
      const status = await getTestStatus(prevLotNo)
      setTestStatus(status)
      if (status.test_phase === 3) {
        setError('이미 양쪽 테스트가 완료된 LOT입니다.')
        return
      }
      // 이미 진행 중이면 기존 OQ 넘버 사용
      if (status.lot_oq_no) {
        setActualOqNo(status.lot_oq_no)
        setIsFirstTest(false)
      } else {
        setIsFirstTest(true)
      }
      setStep('test_choice')
    } catch {
      setTestStatus({ test_phase: 0 })
      setIsFirstTest(true)
      setStep('test_choice')
    }
  }

  // 3) 테스트 선택
  const handleTestSelect = (testNum) => {
    setSelectedTest(testNum)
    setStep('inspect')
  }

  // 4) 검사 데이터 입력 완료
  const handleInspectionSubmit = (data) => {
    setInspectionData(data)
    setStep('confirm')
  }

  // 5) 최종 확인 → OQ 라벨(첫 테스트만) + 데이터 저장 + ST(양쪽 완료 시)
  const handleConfirm = async () => {
    setPrinting(true)
    try {
      let oqNo = actualOqNo
      let printWarning = ''

      // 첫 번째 테스트 → OQ LOT 라벨 출력 (프린트 실패해도 데이터 저장은 계속)
      if (isFirstTest) {
        try {
          const result = await printLot(lotNo, quantity, {
            selected_process: 'OQ',
            lot_chain: lotChain,
            prev_lot_no: prevLotNo,
            ...selections,
          })
          oqNo = result.lot_nums?.[0] || `${lotNo}-00`
        } catch (printErr) {
          // OQ LOT 채번은 실패 → 임시 번호 사용
          oqNo = `${lotNo}-00`
          printWarning = ' (OQ 라벨 출력 실패)'
          console.error('[OQPage] OQ 라벨 출력 실패:', printErr.message)
        }
        setActualOqNo(oqNo)
      }

      // 테스트 데이터 저장
      const submitFn = selectedTest === 1 ? submitTest1 : submitTest2
      const inspResult = await submitFn({
        ...inspectionData,
        lot_oq_no: oqNo,
        lot_so_no: prevLotNo,
      })

      // 양쪽 완료(phase=3) → ST 시리얼 라벨 출력
      if (inspResult.test_phase === 3 && inspResult.serial_no) {
        try {
          await printStLabel(inspResult.serial_no, oqNo)
          setDoneMsg('ST 출력 완료' + printWarning)
        } catch {
          setDoneMsg('저장 완료 (ST 출력 실패)')
        }
      } else {
        setDoneMsg(`Test ${selectedTest} 저장 완료` + printWarning)
      }

      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setLotNo(null); setActualOqNo(''); setSelections(null); setQuantity(null)
    setPhi(''); setMotorType('')
    setInspectionData(null); setDoneMsg(''); setPrinting(false); setDone(false); setError(null)
    setLotChain(null); setPrevLotNo(null)
    setTestStatus(null); setSelectedTest(null); setIsFirstTest(true)
    setStep('qr')
  }

  useAutoReset(error, done, handleReset)

  const phase = testStatus?.test_phase || 0
  const t1Done = phase === 1 || phase === 3
  const t2Done = phase === 2 || phase === 3

  return (
    <>
      {step === 'qr' && (
        <QRScanner key={step} processLabel="OQ, 출하검사"
          onScan={handleScan} onLogout={onLogout} onBack={onBack} />
      )}

      {step === 'selector' && (
        <MaterialSelector steps={OQ_STEPS} autoValues={{ date, seq: '00' }}
          onSubmit={handleMaterialSubmit} onLogout={onLogout} onBack={() => setStep('qr')}
          scannedLot={prevLotNo ? { lot_no: prevLotNo, quantity } : null} />
      )}

      {step === 'test_choice' && (
        <div className="page">
          <div className="card" style={{ textAlign: 'center' }}>
            <FaradayLogo size="md" />
            <p style={{ fontWeight: 700, fontSize: 18, margin: '12px 0 4px' }}>테스트 선택</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 4 }}>
              {phi && `Φ${phi}`}{motorType ? ` · ${motorType}` : ''} · {prevLotNo}
            </p>
            {actualOqNo && (
              <p style={{ fontSize: 12, color: 'var(--color-primary)', marginBottom: 8 }}>
                OQ: {actualOqNo}
              </p>
            )}

            {phase > 0 && (
              <p style={{ fontSize: 12, color: 'var(--color-primary)', marginBottom: 16 }}>
                {phase === 1 && 'Test 1 완료 — Test 2를 진행하세요'}
                {phase === 2 && 'Test 2 완료 — Test 1을 진행하세요'}
              </p>
            )}

            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <button
                className="btn-primary btn-lg"
                style={{
                  flex: 1,
                  opacity: t1Done ? 0.5 : 1,
                  background: t1Done ? 'var(--color-text-muted)' : undefined,
                  borderColor: t1Done ? 'var(--color-text-muted)' : undefined,
                }}
                disabled={t1Done}
                onClick={() => handleTestSelect(1)}
              >
                {t1Done ? 'Test 1 ✅' : 'Test 1'}
                <br /><span style={{ fontSize: 11, fontWeight: 400 }}>R / L / I.T.</span>
              </button>
              <button
                className="btn-primary btn-lg"
                style={{
                  flex: 1,
                  opacity: t2Done ? 0.5 : 1,
                  background: t2Done ? 'var(--color-text-muted)' : undefined,
                  borderColor: t2Done ? 'var(--color-text-muted)' : undefined,
                }}
                disabled={t2Done}
                onClick={() => handleTestSelect(2)}
              >
                {t2Done ? 'Test 2 ✅' : 'Test 2'}
                <br /><span style={{ fontSize: 11, fontWeight: 400 }}>K_T 측정</span>
              </button>
            </div>

            <button className="btn-text" onClick={() => setStep('selector')}>← 이전으로</button>
          </div>
        </div>
      )}

      {step === 'inspect' && (
        <InspectionForm
          testPhase={selectedTest}
          phi={phi}
          motorType={motorType}
          lotOqNo={actualOqNo || `${lotNo}-00`}
          lotSoNo={prevLotNo}
          onSubmit={handleInspectionSubmit}
          onCancel={() => setStep('test_choice')}
        />
      )}

      {step === 'confirm' && (
        <ConfirmModal
          lotNo={actualOqNo || `${lotNo}-00`}
          printCount={quantity}
          extraInfo={`Test ${selectedTest}${isFirstTest ? ' + OQ 라벨' : ''}`}
          printing={printing} done={done} error={error}
          doneMessage={doneMsg}
          onConfirm={handleConfirm} onCancel={handleReset} />
      )}
    </>
  )
}
