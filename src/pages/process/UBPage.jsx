// src/pages/process/UBPage.jsx
// ★ UB 소포장 — BoxManager에 UB 설정만 전달
// 호출: App.jsx → process === 'UB'
import BoxManager from '@/components/BoxManager'

export default function UBPage({ onLogout, onBack }) {
  return (
    <BoxManager
      process="UB"
      processLabel="UB 소포장"
      scanLabel="OQ 제품 스캔"
      itemLabel="담긴 아이템"
      onLogout={onLogout}
      onBack={onBack}
    />
  )
}
