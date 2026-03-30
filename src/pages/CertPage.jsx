import { useState } from 'react'
import { verifyCert } from '@/api'
import s from './CertPage.module.css'

const BLUE = '#1F2677'
const ORANGE = '#F99535'
const BORDER = '#e4e4e8'
const DARK = '#1a1a1a'

const PROCESS_LABELS = {
  RM: 'Raw material',
  MP: 'Material prep',
  EA: 'Each processing',
  HT: 'Heat treatment',
  BO: 'Bonding',
  EC: 'E-coating',
  WI: 'Winding',
  SO: 'Star point',
  OQ: 'Outgoing QC',
}

const PROCESS_ORDER = [
  'lot_oq_no',
  'lot_so_no',
  'lot_wi_no',
  'lot_ec_no',
  'lot_bo_no',
  'lot_ht_no',
  'lot_ea_no',
  'lot_mp_no',
]

// PHI_COLORS import 제거 — SPEC_COLORS로 통일 (배열 → 객체 버그 수정)
const SPEC_COLORS = {
  87: { bg: '#FF69B4', label: 'ϕ87' },
  70: { bg: '#FFB07C', label: 'ϕ70' },
  45: { bg: '#F0D000', label: 'ϕ45' },
  20: { bg: '#77DD77', label: 'ϕ20' },
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}`
}

function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}.${dd}  ${hh}:${mi}`
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 4.5L6 8L9.5 4.5"
        stroke="#b8b8b8"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Logo({ size = 130 }) {
  return (
    <img
      src="/FaradayDynamicsLogo.png"
      width={size}
      alt="Faraday Dynamics"
      style={{ display: 'block' }}
    />
  )
}

// 스펙 뱃지 — SPEC_COLORS로 통일 (PHI_COLORS 배열 버그 수정)
function SpecBadge({ spec }) {
  const info = SPEC_COLORS[spec]
  if (!info) return null
  return (
    <span
      className={s.specBadge}
      style={{ color: info.bg, background: `${info.bg}12`, borderColor: `${info.bg}30` }}
    >
      <span className={s.specDot} style={{ background: info.bg }} />
      {info.label}
    </span>
  )
}

function CertBranch({ branch, branchIdx, totalBranches }) {
  const isLast = branchIdx === totalBranches - 1
  return (
    <div className={s.branchRow}>
      <div className={s.branchConnCol}>
        <div className={s.branchConnH} />
        {!isLast && <div className={s.branchConnV} />}
      </div>
      <div className={s.branchBody}>
        {branch.map((node, nIdx) => {
          const isFirst = nIdx === 0
          const isNodeLast = nIdx === branch.length - 1
          return (
            <div key={nIdx} className={s.nodeRow}>
              <div className={s.nodeDotCol}>
                {/* background — isFirst 조건 동적값 */}
                <div className={s.nodeDot} style={{ background: isFirst ? ORANGE : '#d4d4d4' }} />
                {!isNodeLast && <div className={s.nodeConnV} />}
              </div>
              <div className={s.nodeContent} style={{ paddingBottom: isNodeLast ? 4 : 10 }}>
                <div className={s.nodeHead}>
                  <span className={s.nodeCode} style={{ color: isFirst ? ORANGE : '#b0b0b0' }}>
                    {node.process}
                  </span>
                  <span className={s.nodeLabel}>{node.label}</span>
                  {node.date && <span className={s.nodeDate}>{formatDateTime(node.date)}</span>}
                </div>
                <div className={s.nodeLot}>{node.lot_no}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Timeline({ chain, boBranches }) {
  const [boOpen, setBoOpen] = useState(false)

  const skipCols = new Set()
  if (boBranches && boBranches.length > 0) {
    ;['lot_ht_no', 'lot_ea_no', 'lot_mp_no', 'lot_rm_no'].forEach((c) => skipCols.add(c))
  }

  const items = PROCESS_ORDER.map((col) => {
    if (skipCols.has(col)) return null
    const entry = chain?.[col]
    if (!entry) return null
    const lotNo = typeof entry === 'string' ? entry : entry.lot_no
    const date = typeof entry === 'string' ? '' : entry.date
    if (!lotNo) return null
    const isBo = col === 'lot_bo_no'
    return {
      col,
      lotNo,
      date,
      proc: col.replace('lot_', '').replace('_no', '').toUpperCase(),
      isBo,
    }
  }).filter(Boolean)

  return (
    <div className={s.tl}>
      {items.map((item, idx) => {
        const first = idx === 0
        const last = idx === items.length - 1 && !(item.isBo && boBranches?.length > 0)
        return (
          <div key={item.col}>
            <div className={s.tlRow}>
              <div className={s.tlLeft}>
                {/* 도트 — 크기/색상/그림자 first 조건 동적값 */}
                <div
                  style={{
                    width: first ? 7 : 5,
                    height: first ? 7 : 5,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: first ? ORANGE : '#d4d4d4',
                    boxShadow: first ? `0 0 0 4px ${ORANGE}22` : 'none',
                  }}
                />
                {!last && !(item.isBo && boBranches?.length > 0) && (
                  <div
                    style={{
                      width: first ? 1.5 : 1,
                      flex: 1,
                      minHeight: 20,
                      background: first
                        ? `linear-gradient(to bottom, ${ORANGE}, ${BORDER})`
                        : BORDER,
                    }}
                  />
                )}
              </div>
              <div
                className={s.tlContent}
                style={{ paddingBottom: item.isBo && boBranches?.length > 0 ? 4 : last ? 8 : 14 }}
              >
                <div className={s.tlProc}>
                  <span className={s.tlCode} style={{ color: first ? ORANGE : '#b0b0b0' }}>
                    {item.proc}
                  </span>
                  <span className={s.tlName}>{PROCESS_LABELS[item.proc] || ''}</span>
                  {item.date && <span className={s.tlDate}>{formatDateTime(item.date)}</span>}
                </div>
                <div className={s.tlLot}>{item.lotNo}</div>
                {item.isBo && boBranches?.length > 0 && (
                  <div className={s.tlToggle} onClick={() => setBoOpen((prev) => !prev)}>
                    <span
                      className={s.tlArrow}
                      style={{ transform: boOpen ? 'rotate(90deg)' : 'rotate(0)' }}
                    >
                      ▶
                    </span>
                    {boBranches.length} materials
                  </div>
                )}
              </div>
            </div>

            {/* 분기 슬라이드 — maxHeight/opacity 동적값 */}
            {item.isBo && boBranches?.length > 0 && (
              <div
                className={s.branchWrap}
                style={{ maxHeight: boOpen ? 3000 : 0, opacity: boOpen ? 1 : 0 }}
              >
                <div className={s.branchInner}>
                  {boBranches.map((branch, bIdx) => (
                    <CertBranch
                      key={bIdx}
                      branch={branch}
                      branchIdx={bIdx}
                      totalBranches={boBranches.length}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ProductItem({ product, idx, total, isOpen, onToggle }) {
  return (
    <div>
      <div className={s.prodHeader} onClick={onToggle}>
        <div className={s.prodLeft}>
          {/* background — isOpen 조건 동적값 */}
          <div className={s.prodDot} style={{ background: isOpen ? ORANGE : BORDER }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={s.prodLot}>{product.oq_lot_no}</span>
              {product.spec && <SpecBadge spec={product.spec} />}
            </div>
            <div className={s.prodSub}>
              Unit {idx + 1} of {total}
            </div>
          </div>
        </div>
        <div className={s.prodArrow} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
          <ChevronDown />
        </div>
      </div>
      {/* maxHeight — isOpen 조건 동적값 */}
      <div className={s.prodContent} style={{ maxHeight: isOpen ? 3000 : 0 }}>
        <Timeline chain={product.chain} boBranches={product.bo_branches} />
      </div>
    </div>
  )
}

export default function CertPage() {
  const [pw, setPw] = useState('')
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [openKeys, setOpenKeys] = useState(new Set())

  const obLotNo = window.location.pathname.split('/cert/')[1] || ''

  const handleVerify = async () => {
    if (!pw.trim()) return
    setLoading(true)
    setError('')
    try {
      const result = await verifyCert(obLotNo, pw)
      setData(result)
      setVerified(true)
    } catch (e) {
      setError(e.message || 'Unable to connect to server')
    } finally {
      setLoading(false)
    }
  }

  const totalProducts = data?.boxes?.reduce((sum, b) => sum + b.products.length, 0) || 0

  if (!verified) {
    return (
      <div className={s.page}>
        <div className={s.pwWrap}>
          <div style={{ marginBottom: 48 }}>
            <Logo size={160} />
          </div>
          <h1 className={s.pwTitle}>Certificate of Quality</h1>
          <p className={s.pwSub}>Enter the password included with your product.</p>
          <div style={{ width: '100%' }}>
            {/* borderColor — 입력 상태별 동적값 */}
            <input
              className={s.pwInput}
              style={{ borderColor: error ? '#e24b4a' : pw ? BLUE : BORDER }}
              type="password"
              placeholder="· · · · · ·"
              value={pw}
              onChange={(e) => {
                setPw(e.target.value)
                setError('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              autoFocus
              maxLength={8}
            />
            {error && <p className={s.errText}>{error}</p>}
          </div>
          <button className={s.verifyBtn} onClick={handleVerify} disabled={!pw.trim() || loading}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
          <p className={s.footerUrl}>lot.mes-fd.com</p>
        </div>
      </div>
    )
  }

  return (
    <div className={s.page}>
      <div className={s.certWrap}>
        <div className={s.certHeader}>
          <Logo size={120} />
          <div className={s.certBadge}>Certificate of quality</div>
        </div>

        <div className={s.infoGrid}>
          <div>
            <div className={s.infoLabel}>Shipment</div>
            <div className={s.infoValue}>{data?.ob_lot_no}</div>
          </div>
          <div>
            <div className={s.infoLabel}>Date</div>
            <div className={s.infoValue}>{formatDate(data?.created_at)}</div>
          </div>
          <div>
            <div className={s.infoLabel}>Boxes</div>
            <div className={s.infoValue}>{data?.boxes?.length || 0}</div>
          </div>
          <div>
            <div className={s.infoLabel}>Total units</div>
            <div className={s.infoValue}>{totalProducts}</div>
          </div>
        </div>

        {data?.boxes?.map((box, bIdx) => {
          const count = box.products.length
          return (
            <div key={bIdx}>
              <div className={s.divRow}>
                <div className={s.divLine} />
                <span className={s.divLabel}>
                  {box.mb_lot_no} — {count} unit{count > 1 ? 's' : ''}
                </span>
                <div className={s.divLine} />
              </div>
              {box.products.map((product, pIdx) => {
                const key = `${bIdx}-${pIdx}`
                return (
                  <ProductItem
                    key={key}
                    product={product}
                    idx={pIdx}
                    total={count}
                    isOpen={openKeys.has(key)}
                    onToggle={() =>
                      setOpenKeys((prev) => {
                        const next = new Set(prev)
                        next.has(key) ? next.delete(key) : next.add(key)
                        return next
                      })
                    }
                  />
                )
              })}
            </div>
          )
        })}

        <div className={s.certFooter}>
          <p className={s.footerText}>
            This certificate verifies the complete manufacturing traceability of all products
            contained in this shipment.
          </p>
          <div style={{ marginBottom: 8 }}>
            <Logo size={100} />
          </div>
          <p className={s.footerTagline}>Precision motors engineered for the future of mobility.</p>
          <p className={s.footerUrl} style={{ paddingTop: 4 }}>
            lot.mes-fd.com
          </p>
        </div>
      </div>
    </div>
  )
}
