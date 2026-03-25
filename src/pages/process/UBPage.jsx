import BoxManager from '@/components/BoxManager'

export default function UBPage({ onLogout, onBack }) {
  return (
    <BoxManager
      process="UB"
      processLabel="UB 소포장"
      scanLabel="OQ 제품 스캔"
      prevProcess="OQ"
      onLogout={onLogout}
      onBack={onBack}
    />
  )
}
