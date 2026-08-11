// pages/process/manage/RotorDiscardRouter.jsx
// 회전자 폐기 라우터 (2026-08-05, 갱신 2026-08-11) — 스캔 → LOT 판별 → 알맞은 폐기 화면으로 자동 분기.
//   route='bo'         → 본딩품(BO) 폐기 (BODiscardPage, BO 재고 기준)
//   route='yoke'       → 요크(EA,무자석·본딩 전) 부분폐기 (YokeDiscardPage)
//   route='bonded_ea'  → 요크가 전량 본딩됨 → EA 로 폐기 불가, BO(BM) 번호를 스캔하라고 안내
//   ★ '요크임을 알았을 때 움직인다' — 진입 시 확정하지 않고 스캔한 실제 LOT 을 보고 라우팅.
import { useState } from 'react'
import QRScanner from '@/components/QRScanner'
import PageHeader from '@/components/common/PageHeader'
import { classifyRotorDiscard } from '@/api'
import YokeDiscardPage from '@/pages/process/manage/YokeDiscardPage'
import BODiscardPage from '@/pages/process/manage/BODiscardPage'
import RotorDiscardPage from '@/pages/process/produce/RotorDiscardPage'

export default function RotorDiscardRouter({ onLogout, onBack }) {
  const [info, setInfo] = useState(null)   // classify 결과 { route, bo_lot, lot_ea_no, phi, motor_type, bo2_done, ... }
  const [yokeMagnet, setYokeMagnet] = useState(false)   // 요크인데 자석 붙은 채 폐기(수동 전환)

  const backToScan = () => { setInfo(null); setYokeMagnet(false) }

  const onScan = async (val) => {
    const l = (val || '').trim()
    if (!l) return
    const r = await classifyRotorDiscard(l)   // 이력 없음 시 QRScanner 가 에러 표시
    setInfo(r); setYokeMagnet(false)
  }

  if (!info) {
    return (
      <QRScanner
        processLabel="회전자 폐기 · LOT 스캔 (요크/본딩 자동판별)"
        onScan={onScan} onLogout={onLogout} onBack={onBack}
      />
    )
  }

  if (info.route === 'bo') {
    return (
      <BODiscardPage
        boLot={info.bo_lot || info.scanned}
        bo2Done={!!info.bo2_done}
        phi={info.phi} motorType={info.motor_type}
        onBack={backToScan}
      />
    )
  }

  if (info.route === 'bonded_ea') {
    return (
      <div className="page-flat">
        <PageHeader title="회전자 폐기" subtitle={`Φ${info.phi || ''} ${info.motor_type || ''}`} onBack={backToScan} />
        <div style={{ padding: '40px 16px', textAlign: 'center', maxWidth: 420, margin: '0 auto' }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>이 요크는 전량 본딩되었습니다.</p>
          <p style={{ color: 'var(--color-text-sub)', marginBottom: 20 }}>
            요크(EA) 번호로는 폐기할 수 없습니다. 폐기하려는 <b>본딩(BO/BM) 번호</b>를 스캔해 주세요.
          </p>
          <button type="button" className="btn-primary btn-lg btn-full" onClick={backToScan}>← 다시 스캔</button>
        </div>
      </div>
    )
  }

  // route === 'yoke' (EA in_stock) — 기본 무자석 부분폐기. 자석 붙은 요크면 자석 차감 폐기로 수동 전환.
  if (yokeMagnet) {
    return (
      <RotorDiscardPage
        onLogout={onLogout} onBack={backToScan}
        initialLot={info.lot_ea_no || info.scanned}
        onSwitch={() => setYokeMagnet(false)}
      />
    )
  }
  return (
    <YokeDiscardPage
      onLogout={onLogout} onBack={backToScan}
      initialLot={info.lot_ea_no || info.scanned}
      onSwitch={() => setYokeMagnet(true)}
    />
  )
}
