// pages/cert/sheet/CompanyOrdersBar.jsx
// sheet 헤더 위 회사 정보 + 뒤로가기 묶음 바 (Phase D, 2026-05-02 / CertFlow 분할 2026-05-08).
// 회사 세션 있을 때만 표시. QR 직접진입 + 회사 로그인 통과한 경우도 포함.
//
// 2026-05-07: 뒤로가기 두 개 (View Master Box + My Orders) 한 줄 통합 + 시각 구분.
//   - MB 뷰    → My Orders 만 (1단계 위)
//   - UB 뷰    → MB 페이지 (2차 outlined) + My Orders (1차 filled) 둘 다 노출 (2단계 hierarchy)

import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { getCompanySession } from '../CertCompanyFlow'

export default function CompanyOrdersBar({ mbLotNo, onBackToMB, siblingMbs = [], currentMb }) {
  const navigate = useNavigate()
  const sess = getCompanySession()
  if (!sess) return null
  const handleBackToOrders = () => {
    // ?cert-preview 등 dev query 보존
    const search = window.location.search || ''
    navigate(`/${search}`)
  }
  // 형제 MB 전환 — sheet_token 이미 캐시돼 있어 PW 재입력 없이 즉시 이동 (2026-05-15)
  const handleSwitchMb = (e) => {
    const v = e.target.value
    if (v && v !== currentMb) {
      const search = window.location.search || ''
      navigate(`/${v}${search}`)
    }
  }
  // UB 뷰일 때만 onBackToMB 전달됨 (MB 뷰에선 undefined)
  const showMbBack = !!onBackToMB && !!mbLotNo
  // MB 뷰(UB 아님) + 같은 OB 형제 MB 2개+ 일 때만 전환 드롭다운 노출
  const showMbSwitch = !showMbBack && siblingMbs.length > 1
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        margin: '0 0 8px',
        background: '#e8f3ff',
        borderRadius: 8,
        fontSize: 12,
        color: '#1763d6',
      }}
    >
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        🔐 <strong style={{ color: 'inherit' }}>{sess.company_name || 'Company'}</strong>
      </span>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        {showMbSwitch && (
          <select
            value={currentMb || ''}
            onChange={handleSwitchMb}
            title="Switch master box in this shipment"
            style={{
              background: '#fff',
              border: '1px solid currentColor',
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'inherit',
              cursor: 'pointer',
              fontVariantNumeric: 'tabular-nums',
              maxWidth: 150,
            }}
          >
            {siblingMbs.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        {showMbBack && (
          /* 중간 단계 — outlined / 흰 배경 + 실제 MB 번호 표시 (concrete / 가까운 위) */
          <button
            type="button"
            onClick={onBackToMB}
            title="View master box page"
            style={{
              background: '#fff',
              border: '1px solid currentColor',
              borderRadius: 999,
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              color: 'inherit',
              fontVariantNumeric: 'tabular-nums',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#dceaff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
          >
            ← {mbLotNo}
          </button>
        )}
        {/* 최상위 — filled / 진한 강조 (abstract / 최종 목적지) */}
        <button
          type="button"
          onClick={handleBackToOrders}
          title="View all your shipments"
          style={{
            background: '#1763d6',
            border: '1px solid #1763d6',
            borderRadius: 999,
            padding: '4px 12px',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            color: '#fff',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#0f4ca8' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#1763d6' }}
        >
          ← My Orders
        </button>
      </div>
    </motion.div>
  )
}
