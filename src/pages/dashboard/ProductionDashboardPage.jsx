// pages/dashboard/ProductionDashboardPage.jsx
// 생산 대시보드 셸 (2026-08-11) — 두 탭을 얹기만 한다. 집계 로직은 각 탭 파일에.
//   생산 현황  → ProductionDaily   : 공정 × 일자 생산량 매트릭스 + 셀 드릴다운
//   주간 리포트 → ProductionWeekly : 완제품 + 공정별/모델별 실적 + 주간 LOT 목록
import { useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import ProductionDaily from './ProductionDaily'
import ProductionWeekly from './ProductionWeekly'
import s from './ProductionDashboardPage.module.css'

const TABS = [
  { key: 'daily', label: '생산 현황' },
  { key: 'weekly', label: '주간 리포트' },
]

export default function ProductionDashboardPage({ onBack }) {
  const [tab, setTab] = useState('daily')

  return (
    <div className="page-flat">
      <PageHeader
        title="생산 현황은 어떤가요?"
        subtitle="공정별 일 생산량 · 신규 / 재공정 / 경유 구분"
        onBack={onBack}
      />

      <div className={s.tabs} role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab"
            aria-selected={tab === t.key}
            className={`${s.tab} ${tab === t.key ? s.tabOn : ''}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'daily' ? <ProductionDaily /> : <ProductionWeekly />}
    </div>
  )
}
