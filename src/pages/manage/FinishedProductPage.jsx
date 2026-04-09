import { useState, useEffect } from 'react'
import { getFinishedProducts } from '@/api'
import { FaradayLogo } from '@/components/FaradayLogo'
import { PHI_SPECS } from '@/constants/processConst'
import s from './FinishedProductPage.module.css'

const phiColor = (phi) => PHI_SPECS[phi]?.color ?? '#ccc'

export default function FinishedProductPage({ onLogout, onBack }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterPhi, setFilterPhi] = useState('')

  const fetchData = async () => {
    try {
      const result = await getFinishedProducts()
      setData(result)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const items = data?.items || []
  const filtered = filterPhi ? items.filter((r) => r.phi === filterPhi) : items
  const summary = data?.summary || {}

  return (
    <div className={s.page}>
      <div className={s.container}>
        {/* 헤더 */}
        <div className={s.header}>
          <div className={s.headerLeft}>
            <FaradayLogo size="sm" />
            <div>
              <p className={s.title}>완제품 재고</p>
              <p className={s.sub}>OQ 검사 완료 + UB 미투입</p>
            </div>
          </div>
          <div className={s.headerBtns}>
            {onBack && <button className="btn-ghost btn-sm" onClick={onBack}>← 이전</button>}
            <button className="btn-ghost btn-sm" onClick={onLogout}>로그아웃</button>
          </div>
        </div>

        {/* 파이별 요약 카드 */}
        <div className={s.summaryRow}>
          <button
            className={`${s.summaryCard} ${!filterPhi ? s.summaryActive : ''}`}
            onClick={() => setFilterPhi('')}
          >
            <span className={s.summaryCount}>{data?.total ?? '-'}</span>
            <span className={s.summaryLabel}>전체</span>
          </button>
          {Object.entries(summary).map(([phi, count]) => (
            <button
              key={phi}
              className={`${s.summaryCard} ${filterPhi === phi ? s.summaryActive : ''}`}
              style={filterPhi === phi ? { borderColor: phiColor(phi) } : {}}
              onClick={() => setFilterPhi(filterPhi === phi ? '' : phi)}
            >
              <span className={s.phiBadge} style={{ background: phiColor(phi) }}>Φ{phi}</span>
              <span className={s.summaryCount}>{count}</span>
            </button>
          ))}
        </div>

        {/* 에러/로딩 */}
        {loading && <p className={s.info}>로딩 중...</p>}
        {error && <p className={s.error}>{error}</p>}

        {/* 결과 카운트 */}
        {!loading && <p className={s.info}>총 {filtered.length}개</p>}

        {/* 테이블 */}
        {filtered.length > 0 && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>시리얼</th>
                  <th>OQ LOT</th>
                  <th>SO LOT</th>
                  <th>Φ</th>
                  <th>Motor</th>
                  <th>Wire</th>
                  <th>R (Ω)</th>
                  <th>L</th>
                  <th>검사일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.lot_oq_no}>
                    <td className={s.mono}>{r.serial_no}</td>
                    <td className={s.mono}>{r.lot_oq_no}</td>
                    <td className={s.mono}>{r.lot_so_no || '-'}</td>
                    <td>
                      <span className={s.phiBadge} style={{ background: phiColor(r.phi) }}>
                        Φ{r.phi}
                      </span>
                    </td>
                    <td>{r.motor_type || '-'}</td>
                    <td>{r.wire_type}</td>
                    <td>{r.resistance ?? '-'}</td>
                    <td>{r.inductance ?? '-'}</td>
                    <td className={s.dateCell}>
                      {r.created_at ? r.created_at.replace('T', ' ').slice(0, 16) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 모바일 카드 */}
        {filtered.length > 0 && (
          <div className={s.cardList}>
            {filtered.map((r) => (
              <div key={r.lot_oq_no} className={s.listCard}>
                <div className={s.cardTop}>
                  <span className={s.cardSerial}>{r.serial_no}</span>
                  <div className={s.cardBadges}>
                    <span className={s.phiBadge} style={{ background: phiColor(r.phi) }}>
                      Φ{r.phi}
                    </span>
                    {r.motor_type && <span className={s.cardMotor}>{r.motor_type}</span>}
                  </div>
                </div>
                <div className={s.cardMid}>{r.lot_oq_no} · {r.lot_so_no || '-'} · {r.wire_type}</div>
                <div className={s.cardGrid}>
                  <span>R: {r.resistance ?? '-'}</span>
                  <span>L: {r.inductance ?? '-'}</span>
                </div>
                <div className={s.cardDate}>
                  {r.created_at ? r.created_at.replace('T', ' ').slice(0, 16) : '-'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
