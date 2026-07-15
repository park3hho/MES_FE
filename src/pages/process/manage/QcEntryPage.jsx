// pages/process/manage/QcEntryPage.jsx
// QC 통합 검사 진입 — 3개 선택지 (IQ / IPQ / OQ) (2026-05-31)
// 각 선택은 독립된 페이지로 라우팅.
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import PageHeader from '@/components/common/PageHeader'
import { QC_TYPE_LABELS } from '@/constants/qcConst'
import s from './QcEntryPage.module.css'

const CARDS = [
  {
    type: 'IQ',
    label: QC_TYPE_LABELS.IQ,
    desc: '외주/원자재 입고 시 검사',
    path: '/admin/qc-inspect/iq',
    accent: '#0ea5e9',
  },
  {
    type: 'IPQ',
    label: QC_TYPE_LABELS.IPQ,
    desc: '공정 중간 단계 검사',
    path: '/admin/qc-inspect/ipq',
    accent: '#10b981',
  },
  {
    type: 'OQ',
    label: QC_TYPE_LABELS.OQ,
    desc: '출하 전 단품 측정 검사',
    path: '/process/OQ',
    accent: '#f59e0b',
  },
  {
    // FP 번호(ST 시리얼) 재공정 — IPQInspectPage 흐름 재사용, 라벨만 다름 (2026-07-14)
    type: 'FP',
    label: 'FP 재공정',
    desc: 'FP 번호(ST) 되돌리기',
    path: '/admin/fp-repair',
    accent: '#a855f7',
  },
]


export default function QcEntryPage({ onBack }) {
  const navigate = useNavigate()
  return (
    <div className="page-flat">
      <PageHeader title="품질검사 (QC)" subtitle="검사 종류를 선택하세요" onBack={onBack} />
      <div className={s.grid}>
        {CARDS.map((c, idx) => (
          <motion.button
            key={c.type}
            type="button"
            className={s.card}
            onClick={() => navigate(c.path)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: idx * 0.05 }}
            whileHover={{ y: -2 }}
            style={{ '--accent': c.accent }}
          >
            <span className={s.code}>{c.type}</span>
            <span className={s.label}>{c.label}</span>
            <span className={s.desc}>{c.desc}</span>
            {c.note && <span className={s.note}>{c.note}</span>}
          </motion.button>
        ))}
      </div>
    </div>
  )
}
