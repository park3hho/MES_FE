import { useState } from 'react'
import MaterialSelector from '../components/MaterialSelector'
import { CountModal } from '../components/CountModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { printLabel } from '../api'



export default function RMPage() {
  const [lotNo, setLotNo] = useState(null)
  const [printCount, setPrintCount] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  const handleMaterialSubmit = (selections) => {
    const lot = `${selections.vendor}-${selections.material}-${selections.thickness}-${selections.width}`
    setLotNo(lot)
  }

  const handleCountSelect = (count) => {
    setPrintCount(count)
  }

  const handleConfirm = async () => {
    setPrinting(true)
    try {
      await printLabel(lotNo, printCount)
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const handleReset = () => {
    setLotNo(null)
    setPrintCount(null)
    setPrinting(false)
    setDone(false)
    setError(null)
  }

  return (
    <>
      <MaterialSelector onSubmit={handleMaterialSubmit} />
      {lotNo && !printCount && (
        <CountModal lotNo={lotNo} onSelect={handleCountSelect} onCancel={handleReset} />
      )}
      {lotNo && printCount && (
        <ConfirmModal
          lotNo={lotNo}
          printCount={printCount}
          printing={printing}
          done={done}
          error={error}
          onConfirm={handleConfirm}
          onCancel={handleReset}
        />
      )}
    </>
  )
}