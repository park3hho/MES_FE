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

function Timeline({ chain }) {
  let isFirst = true
  return (
    <div style={s.tl}>
      {PROCESS_ORDER.map((col) => {
        const lot = chain?.[col]
        if (!lot) return null
        const proc = col.replace("lot_", "").replace("_no", "").toUpperCase()
        const first = isFirst
        if (isFirst) isFirst = false
        return (
          <div key={col} style={s.tlRow}>
            <div style={s.tlLeft}>
              <div style={{
                width: first ? 7 : 5, height: first ? 7 : 5,
                borderRadius: "50%", flexShrink: 0,
                background: first ? ORANGE : "#d4d4d4",
                boxShadow: first ? `0 0 0 4px ${ORANGE}22` : "none",
              }} />
              {first
                ? <div style={{ width: 1.5, height: 22, background: `linear-gradient(to bottom, ${ORANGE}, ${BORDER})` }} />
                : <div style={{ width: 1, height: 22, background: BORDER }} />
              }
            </div>
            <div style={s.tlContent}>
              <div style={s.tlProc}>
                <span style={{ ...s.tlCode, color: first ? ORANGE : "#b0b0b0" }}>{proc}</span>
                <span style={s.tlName}>{PROCESS_LABELS[proc] || ""}</span>
              </div>
              <div style={s.tlLot}>{lot}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProductItem({ product, idx, total, isOpen, onToggle }) {
  return (
    <div style={{ borderBottom: "1px solid #f0f0f4" }}>
      <div style={s.prodHeader} onClick={onToggle}>
        <div style={s.prodLeft}>
          <div style={{
            ...s.prodDot,
            background: isOpen ? ORANGE : BORDER,
          }} />
          <div>
            <div style={s.prodLot}>{product.oq_lot_no}</div>
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
        maxHeight: isOpen ? 600 : 0,
        overflow: "hidden",
        transition: "max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
      }}>
        <Timeline chain={product.chain} />
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
  const [openKey, setOpenKey] = useState(null)

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

  // ── Password screen ──
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

  // ── Certificate screen ──
  return (
    <div style={s.page}>
      <div style={s.certWrap}>
        {/* Header */}
        <div style={s.certHeader}>
          <Logo size={120} />
          <div style={s.certBadge}>Certificate of quality</div>
        </div>

        {/* Shipment info */}
        <div style={s.infoGrid}>
          <div><div style={s.infoLabel}>Shipment</div><div style={s.infoValue}>{data?.ob_lot_no}</div></div>
          <div><div style={s.infoLabel}>Date</div><div style={s.infoValue}>{formatDate(data?.created_at)}</div></div>
          <div><div style={s.infoLabel}>Boxes</div><div style={s.infoValue}>{data?.boxes?.length || 0}</div></div>
          <div><div style={s.infoLabel}>Total units</div><div style={s.infoValue}>{totalProducts}</div></div>
        </div>

        {/* Boxes with products */}
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
                    isOpen={openKey === key}
                    onToggle={() => setOpenKey(openKey === key ? null : key)}
                  />
                )
              })}
            </div>
          )
        })}

        {/* Footer */}
        <div style={s.certFooter}>
          <p style={s.footerText}>
            This certificate verifies the complete manufacturing
            traceability of all products contained in this shipment.
          </p>
          <div style={{ marginBottom: 8 }}>
            <Logo size={100} />
          </div>
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

  // PW screen
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

  // Cert screen
  certWrap: { width: "100%", maxWidth: 460, padding: "52px 28px 40px" },
  certHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 44 },
  certBadge: { fontSize: 10, fontWeight: 650, color: ORANGE, letterSpacing: "0.1em", textTransform: "uppercase" },

  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "22px 36px", marginBottom: 40 },
  infoLabel: { fontSize: 10, fontWeight: 650, color: "#b0b0b0", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 },
  infoValue: { fontSize: 16, fontWeight: 640, color: BLUE, letterSpacing: "-0.01em" },

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
  tlLot: { fontSize: 13, fontWeight: 540, color: DARK, marginTop: 2 },

  certFooter: { marginTop: 52, paddingTop: 28, borderTop: `1px solid ${BORDER}`, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" },
  footerText: { fontSize: 11, color: "#c0c0c0", lineHeight: 1.65, margin: "0 0 16px" },
}