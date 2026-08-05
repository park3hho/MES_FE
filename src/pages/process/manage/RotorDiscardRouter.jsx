// pages/process/manage/RotorDiscardRouter.jsx
// 회전자 폐기 라우터 (2026-08-05) — 스캔 → LOT 판별(EA/BO) → 요크(무자석) / 본딩품(자석 차감) 폐기로 자동 분기.
//   ★ '요크임을 알았을 때 움직인다' — 진입 시 요크로 확정하지 않고, 스캔한 실제 LOT 을 보고 라우팅.
//   판별이 애매하면(잔량 있는데 본딩이력도 있음 등) 각 폐기 화면의 '수동 전환'(onSwitch)으로 바꿀 수 있음.
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import { classifyRotorDiscard } from '@/api'
import YokeDiscardPage from '@/pages/process/manage/YokeDiscardPage'
import RotorDiscardPage from '@/pages/process/produce/RotorDiscardPage'

export default function RotorDiscardRouter({ onLogout, onBack }) {
  const [lot, setLot] = useState(null)
  const [route, setRoute] = useState(null)   // 'yoke'(무자석) | 'bonded'(자석 차감)

  const backToScan = () => { setLot(null); setRoute(null) }

  const onScan = async (val) => {
    const l = (val || '').trim()
    if (!l) return
    const r = await classifyRotorDiscard(l)   // 이력 없음/요크 아님 시 QRScanner 가 에러 표시
    setLot(r.lot_ea_no || l)
    setRoute(r.route)
  }

  if (!route) {
    return (
      <QRScanner
        processLabel="회전자 폐기 · LOT 스캔 (요크/본딩 자동판별)"
        onScan={onScan} onLogout={onLogout} onBack={onBack}
      />
    )
  }
  if (route === 'bonded') {
    return (
      <RotorDiscardPage
        onLogout={onLogout} onBack={backToScan}
        initialLot={lot} onSwitch={() => setRoute('yoke')}
      />
    )
  }
  return (
    <YokeDiscardPage
      onLogout={onLogout} onBack={backToScan}
      initialLot={lot} onSwitch={() => setRoute('bonded')}
    />
  )
}
