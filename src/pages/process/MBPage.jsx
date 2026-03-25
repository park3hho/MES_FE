import BoxManager from '@/components/BoxManager'

export default function MBPage({ onLogout, onBack }) {
  return (
    <BoxManager
      process="MB"
      processLabel="MB 대포장"
      scanLabel="UB 박스 스캔"
      prevProcess="UB"
      onLogout={onLogout}
      onBack={onBack}
    />
  )
}
