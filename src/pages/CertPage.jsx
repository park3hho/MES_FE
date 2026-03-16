import { useState } from "react"

const BLUE = "#1F2677"
const ORANGE = "#F99535"
const DARK = "#1a1a1a"
const BORDER = "#e4e4e8"

const PROCESS_LABELS = {
  RM: "Raw material", MP: "Material prep", EA: "Each processing",
  HT: "Heat treatment", BO: "Bonding", EC: "E-coating",
  IQ: "Incoming QC", WI: "Winding", SO: "Star point", OQ: "Outgoing QC",
}

const PROCESS_ORDER = ["lot_oq_no","lot_so_no","lot_wi_no","lot_iq_no","lot_ec_no","lot_bo_no","lot_ht_no","lot_ea_no","lot_mp_no","lot_rm_no"]

// ★ 파이 스펙 컬러 매핑
const SPEC_COLORS = {
  "87": { bg: "#FF69B4", label: "ϕ87" },
  "70": { bg: "#FFB07C", label: "ϕ70" },
  "45": { bg: "#F0D000", label: "ϕ45" },
  "20": { bg: "#77DD77", label: "ϕ20" },
}

const BASE_URL = import.meta.env.VITE_API_URL || ""

function formatDate(iso) {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${d.getFullYear()}. ${String(d.getMonth()+1).padStart(2,'0')}. ${String(d.getDate()).padStart(2,'0')}`
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="#b8b8b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function Logo({ size = 130 }) {
  return (
    <img
      src="/FaradayDynamicsLogo.png"
      width={size}
      alt="Faraday Dynamics"
      style={{ display: "block" }}
    />
  )
}

function formatDateTime(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  const hh = String(d.getHours()).padStart(2,'0')
  const mi = String(d.getMinutes()).padStart(2,'0')
  return `${mm}.${dd}  ${hh}:${mi}`
}

// ★ 파이 스펙 뱃지
function SpecBadge({ spec }) {
  const info = SPEC_COLORS[spec]
  if (!info) return null
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 650, letterSpacing: "0.03em",
      color: info.bg, background: `${info.bg}12`,
      padding: "2px 8px", borderRadius: 10,
      border: `1px solid ${info.bg}30`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: info.bg, flexShrink: 0,
      }} />
      {info.label}
    </span>
  )
}

function CertBranch({ branch, branchIdx, totalBranches }) {
  const isLast = branchIdx === totalBranches - 1
  return (
    <div style={{ display: "flex", marginBottom: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0 }}>
        <div style={{ width: 10, height: 1.5, background: "#d4d4d4", marginTop: 8, alignSelf: "flex-end" }} />
        {!isLast && <div style={{ width: 1, flex: 1, background: BORDER, alignSelf: "flex-start" }} />}
      </div>
      <div style={{ flex: 1, paddingLeft: 6, paddingTop: 2, paddingBottom: 4 }}>
        {branch.map((node, nIdx) => {
          const isFirst = nIdx === 0
          const isNodeLast = nIdx === branch.length - 1
          return (
            <div key={nIdx} style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 8, flexShrink: 0 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                  background: isFirst ? ORANGE : "#d4d4d4",
                }} />
                {!isNodeLast && <div style={{ width: 1, flex: 1, minHeight: 10, background: BORDER }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: isNodeLast ? 4 : 10 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: isFirst ? ORANGE : "#b0b0b0", letterSpacing: "0.04em" }}>{node.process}</span>
                  <span style={{ fontSize: 10, color: "#c8c8c8" }}>{node.label}</span>
                  {node.date && <span style={{ fontSize: 9, color: "#d0d0d0", marginLeft: "auto" }}>{formatDateTime(node.date)}</span>}
                </div>
                <div style={{ fontSize: 11, fontWeight: 540, color: DARK, marginTop: 1 }}>{node.lot_no}</div>
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
    ["lot_ht_no", "lot_ea_no", "lot_mp_no", "lot_rm_no"].forEach(c => skipCols.add(c))
  }

  const items = PROCESS_ORDER.map((col) => {
    if (skipCols.has(col)) return null
    const entry = chain?.[col]
    if (!entry) return null
    const lotNo = typeof entry === "string" ? entry : entry.lot_no
    const date = typeof entry === "string" ? "" : entry.date
    if (!lotNo) return null
    const isBo = col === "lot_bo_no"
    return { col, lotNo, date, proc: col.replace("lot_", "").replace("_no", "").toUpperCase(), isBo }
  }).filter(Boolean)

  return (
    <div style={s.tl}>
      {items.map((item, idx) => {
        const first = idx === 0
        const last = idx === items.length - 1 && !(item.isBo && boBranches?.length > 0)
        return (
          <div key={item.col}>
            <div style={s.tlRow}>
              <div style={s.tlLeft}>
                <div style={{
                  width: first ? 7 : 5, height: first ? 7 : 5,
                  borderRadius: "50%", flexShrink: 0,
                  background: first ? ORANGE : "#d4d4d4",
                  boxShadow: first ? `0 0 0 4px ${ORANGE}22` : "none",
                }} />
                {!last && !(item.isBo && boBranches?.length > 0) && (
                  <div style={{
                    width: first ? 1.5 : 1,
                    flex: 1, minHeight: 20,
                    background: first ? `linear-gradient(to bottom, ${ORANGE}, ${BORDER})` : BORDER,
                  }} />
                )}
              </div>
              <div style={{ ...s.tlContent, paddingBottom: (item.isBo && boBranches?.length > 0) ? 4 : last ? 8 : 14 }}>
                <div style={s.tlProc}>
                  <span style={{ ...s.tlCode, color: first ? ORANGE : "#b0b0b0" }}>{item.proc}</span>
                  <span style={s.tlName}>{PROCESS_LABELS[item.proc] || ""}</span>
                  {item.date && <span style={s.tlDate}>{formatDateTime(item.date)}</span>}
                </div>
                <div style={s.tlLot}>{item.lotNo}</div>
                {item.isBo && boBranches?.length > 0 && (
                  <div
                    onClick={() => setBoOpen(prev => !prev)}
                    style={{
                      fontSize: 10, color: ORANGE, fontWeight: 600, marginTop: 3,
                      cursor: "pointer", userSelect: "none",
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    <span style={{
                      display: "inline-block", fontSize: 8,
                      transform: boOpen ? "rotate(90deg)" : "rotate(0)",
                      transition: "transform 0.25s",
                    }}>▶</span>
                    {boBranches.length} materials
                  </div>
                )}
              </div>
            </div>

            {item.isBo && boBranches?.length > 0 && (
              <div style={{
                maxHeight: boOpen ? 3000 : 0,
                opacity: boOpen ? 1 : 0,
                overflow: "hidden",
                transition: "max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease",
              }}>
                <div style={{ marginLeft: 7, paddingLeft: 8, borderLeft: `2px solid ${BORDER}`, marginBottom: 6 }}>
                  {boBranches.map((branch, bIdx) => (
                    <CertBranch key={bIdx} branch={branch} branchIdx={bIdx} totalBranches={boBranches.length} />
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
  const spec = product.spec
  return (
    <div style={{ borderBottom: "1px solid #f0f0f4" }}>
      <div style={s.prodHeader} onClick={onToggle}>
        <div style={s.prodLeft}>
          <div style={{
            ...s.prodDot,
            background: isOpen ? ORANGE : BORDER,
          }} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={s.prodLot}>{product.oq_lot_no}</span>
              {/* ★ 파이 스펙 뱃지 */}
              {spec && <SpecBadge spec={spec} />}
            </div>
            <div style={s.prodSub}>Unit {idx + 1} of {total}</div>
          </div>
        </div>
        <div style={{
          ...s.prodArrow,
          transform: isOpen ? "rotate(180deg)" : "rotate(0)",
        }}>
          <ChevronDown />
        </div>
      </div>
      <div style={{
        maxHeight: isOpen ? 3000 : 0,
        overflow: "hidden",
        transition: "max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      }}>
        <Timeline chain={product.chain} boBranches={product.bo_branches} />
      </div>
    </div>
  )
}

export default function CertPage() {
  const [pw, setPw] = useState("")
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [openKeys, setOpenKeys] = useState(new Set())

  const obLotNo = window.location.pathname.split("/cert/")[1] || ""

  const handleVerify = async () => {
    if (!pw.trim()) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${BASE_URL}/cert/${obLotNo}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pw }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.detail || "Verification failed")
        setLoading(false)
        return
      }
      setData(await res.json())
      setVerified(true)
    } catch (e) {
      setError("Unable to connect to server")
    } finally {
      setLoading(false)
    }
  }

  const totalProducts = data?.boxes?.reduce((sum, b) => sum + b.products.length, 0) || 0

  if (!verified) {
    return (
      <div style={s.page}>
        <div style={s.pwWrap}>
          <div style={{ marginBottom: 48 }}>
            <Logo size={160} />
          </div>
          <h1 style={s.pwTitle}>Certificate of Quality</h1>
          <p style={s.pwSub}>Enter the password included with your product.</p>
          <div style={{ width: "100%" }}>
            <input
              style={{
                ...s.pwInput,
                borderColor: error ? "#e24b4a" : pw ? BLUE : BORDER,
              }}
              type="password"
              placeholder="· · · · · ·"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setError("") }}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              autoFocus
              maxLength={8}
            />
            {error && <p style={s.errText}>{error}</p>}
          </div>
          <button
            style={{ ...s.verifyBtn, opacity: pw.trim() && !loading ? 1 : 0.4 }}
            onClick={handleVerify}
            disabled={!pw.trim() || loading}
          >
            {loading ? "Verifying..." : "Verify"}
          </button>
          <p style={s.footerUrl}>lot.mes-fd.com</p>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.certWrap}>
        <div style={s.certHeader}>
          <Logo size={120} />
          <div style={s.certBadge}>Certificate of quality</div>
        </div>

        <div style={s.infoGrid}>
          <div><div style={s.infoLabel}>Shipment</div><div style={s.infoValue}>{data?.ob_lot_no}</div></div>
          <div><div style={s.infoLabel}>Date</div><div style={s.infoValue}>{formatDate(data?.created_at)}</div></div>
          <div><div style={s.infoLabel}>Boxes</div><div style={s.infoValue}>{data?.boxes?.length || 0}</div></div>
          <div><div style={s.infoLabel}>Total units</div><div style={s.infoValue}>{totalProducts}</div></div>
        </div>

        {data?.boxes?.map((box, bIdx) => {
          const count = box.products.length
          return (
            <div key={bIdx}>
              <div style={s.divRow}>
                <div style={s.divLine} />
                <span style={s.divLabel}>{box.bx_lot_no} — {count} unit{count > 1 ? "s" : ""}</span>
                <div style={s.divLine} />
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
                    onToggle={() => setOpenKeys(prev => {
                      const next = new Set(prev)
                      next.has(key) ? next.delete(key) : next.add(key)
                      return next
                    })}
                  />
                )
              })}
            </div>
          )
        })}

        <div style={s.certFooter}>
          <p style={s.footerText}>
            This certificate verifies the complete manufacturing
            traceability of all products contained in this shipment.
          </p>
          <div style={{ marginBottom: 8 }}>
            <Logo size={100} />
          </div>
          <p style={s.footerTagline}>Precision motors engineered for the future of mobility.</p>
          <p style={{ ...s.footerUrl, paddingTop: 4 }}>lot.mes-fd.com</p>
        </div>
      </div>
    </div>
  )
}

const s = {
  page: {
    minHeight: "100vh", background: "#fff", display: "flex", justifyContent: "center",
    fontFamily: "'Pretendard Variable', 'SF Pro Display', -apple-system, sans-serif",
    WebkitFontSmoothing: "antialiased",
  },

  pwWrap: { width: "100%", maxWidth: 380, padding: "72px 24px 40px", display: "flex", flexDirection: "column", alignItems: "center" },
  pwTitle: { fontSize: 26, fontWeight: 740, color: BLUE, letterSpacing: "-0.02em", margin: "0 0 8px", textAlign: "center" },
  pwSub: { fontSize: 14, color: "#999", lineHeight: 1.55, textAlign: "center", margin: "0 0 44px" },
  pwInput: {
    width: "100%", padding: "14px 0", fontSize: 22, fontWeight: 550,
    letterSpacing: "0.3em", textAlign: "center", border: "none",
    borderBottom: `2px solid ${BORDER}`, outline: "none", background: "transparent",
    color: DARK, transition: "border-color 0.4s", boxSizing: "border-box",
  },
  errText: { fontSize: 12, color: "#e24b4a", margin: "8px 0 0", textAlign: "center" },
  verifyBtn: {
    width: "100%", padding: 15, fontSize: 15, fontWeight: 600,
    color: "#fff", background: BLUE, border: "none",
    borderRadius: 50, cursor: "pointer", transition: "opacity 0.2s", marginTop: 32,
  },
  footerUrl: { fontSize: 10, color: "#d0d0d0", margin: 0, marginTop: "auto", paddingTop: 48 },

  certWrap: { width: "100%", maxWidth: 460, padding: "52px 28px 40px" },
  certHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 44 },
  certBadge: { fontSize: 10, fontWeight: 650, color: ORANGE, letterSpacing: "0.1em", textTransform: "uppercase" },

  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "22px 36px", marginBottom: 40 },
  infoLabel: { fontSize: 10, fontWeight: 650, color: "#b0b0b0", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 },
  infoValue: { fontSize: 16, fontWeight: 640, color: DARK, letterSpacing: "-0.01em" },

  divRow: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20, marginTop: 12 },
  divLine: { flex: 1, height: 1, background: BORDER },
  divLabel: { fontSize: 10, fontWeight: 650, color: "#b0b0b0", letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" },

  prodHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 4px", cursor: "pointer", userSelect: "none" },
  prodLeft: { display: "flex", alignItems: "center", gap: 14 },
  prodDot: { width: 7, height: 7, borderRadius: "50%", transition: "background 0.35s", flexShrink: 0 },
  prodLot: { fontSize: 15, fontWeight: 620, color: DARK, letterSpacing: "-0.01em" },
  prodSub: { fontSize: 11, color: "#b0b0b0", marginTop: 2 },
  prodArrow: { transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center" },

  tl: { padding: "0 4px 16px 32px" },
  tlRow: { display: "flex", gap: 14, position: "relative" },
  tlLeft: { display: "flex", flexDirection: "column", alignItems: "center", width: 10, flexShrink: 0 },
  tlContent: { paddingBottom: 14, flex: 1 },
  tlProc: { display: "flex", alignItems: "baseline", gap: 7 },
  tlCode: { fontSize: 11, fontWeight: 720, letterSpacing: "0.05em" },
  tlName: { fontSize: 11, color: "#c8c8c8" },
  tlDate: { fontSize: 10, color: "#c8c8c8", marginLeft: "auto" },
  tlLot: { fontSize: 13, fontWeight: 540, color: DARK, marginTop: 2 },

  certFooter: { marginTop: 52, paddingTop: 28, borderTop: `1px solid ${BORDER}`, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" },
  footerText: { fontSize: 11, color: "#c0c0c0", lineHeight: 1.65, margin: "0 0 16px" },
  footerTagline: { fontSize: 11, color: "#b0b0b0", fontStyle: "italic", margin: "0 0 12px" },
}