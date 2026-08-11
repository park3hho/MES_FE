// pages/dashboard/ProductionDashboardPage.jsx
// 생산 대시보드 셸 (2026-08-11) — 두 탭을 얹기만 한다. 집계 로직은 각 탭 파일에.
//   생산 현황  → ProductionDaily   : 공정 × 일자 생산량 매트릭스 + 셀 드릴다운
//   주간 리포트 → ProductionWeekly : 완제품 + 공정별/모델별 실적 + 주간 LOT 목록
import { useState } from 'react'
import PageHeader from '@/components/common/PageHeader'
import ProductionDaily from './ProductionDaily'
import ProductionWeekly from './ProductionWeekly'
import s from './ProductionDashboardPage.module.css'

// '주간 리포트' 가 아니라 '주간 실적' — 품질 현황의 '주간 리포트'(QC 검사 기준, 엑셀 양식 출력)와
//   이름이 같으면 무엇을 세는 화면인지 구분이 안 된다. 여기는 전부 LOT 발급 기준이다.
const TABS = [
  { key: 'daily', label: '생산 현황' },
  { key: 'weekly', label: '주간 실적' },
]

export default function ProductionDashboardPage({ onBack }) {
  const [tab, setTab] = useState('daily')

  return (
    <div className="page-flat">
      <PageHeader
        title="생산 현황은 어떤가요?"
        subtitle="LOT 발급 기준 생산 실적 · 신규 / 재공정 / 경유 구분"
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

      <p className={s.scopeNote}>
        세는 단위는 <b>LOT 1건</b> — “얼마나 만들었나”. 검사 건수·양품·불량률처럼
        <b> 검사 1건</b>을 세는 “품질이 어땠나”는 <b>품질 현황 › 주간 리포트</b>에 있습니다.
      </p>

      {tab === 'daily' ? <ProductionDaily /> : <ProductionWeekly />}
    </div>
  )
}
