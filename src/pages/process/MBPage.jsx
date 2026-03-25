// src/pages/process/MBPage.jsx
import BoxManager from '@/components/BoxManager'
export default function MBPage({ onLogout, onBack }) {
  return (
    <BoxManager
      process="MB"
      processLabel="MB 대포장"
      scanLabel="UB 박스 담기"
      onLogout={onLogout}
      onBack={onBack}
    />
  )
}