import { useState } from "react"

const BRAND = { orange: "#F99535", dark: "#1a1a1a", gray: "#8a8a8a", light: "#fafafa", border: "#ececec" }

const PROCESS_LABELS = {
  RM: "Raw material", MP: "Material prep", EA: "Each processing",
  HT: "Heat treatment", BO: "Bonding", EC: "E-coating",
  IQ: "Incoming QC", WI: "Winding", SO: "Star point", OQ: "Outgoing QC",
}

const PROCESS_ORDER = ["lot_oq_no","lot_so_no","lot_wi_no","lot_iq_no","lot_ec_no","lot_bo_no","lot_ht_no","lot_ea_no","lot_mp_no","lot_rm_no"]

const BASE_URL = import.meta.env.VITE_API_URL || ""

function formatDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
  })
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="#b8b8b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function Logo() {
  return (
    <div style={s.logoArea}>
      <div style={s.logoDot} />
      <div style={s.logoText}>Faraday Dynamics</div>
    </div>
  )
}

function InfoItem({ label, value }) {
  return (
    <div>
      <div style={s.infoLabel}>{label}</div>
      <div style={s.infoValue}>{value || "—"}</div>
    </div>
  )
}

function Timeline({ chain }) {
  let isFirst = true
  return (
    <div style={s.tl}>
      {PROCESS_ORDER.map((col) => {
        const lot = chain?.[col]
        if (!lot) return null
        const proc = col.replace("lot_", "").replace("_no", "").upper
          ? col.replace("lot_", "").replace("_no", "").toUpperCase()
          : col
        const first = isFirst
        if (isFirst) isFirst = false
        return (
          <div key={col} style={s.tlRow}>
            <div style={s.tlLeft}>
              {!first && (
                <div style={{
                  ...s.tlLine,
                  background: first ? BRAND.orange : BRAND.border,
                }} />
              )}
              {first && <div style={{ ...s.tlLine, background: `linear-gradient(to bottom, ${BRAND.orange}, ${BRAND.border})` }} />}
              <div style={{
                ...s.tlDot,
                background: first ? BRAND.orange : "#d4d4d4",
                boxShadow: first ? `0 0 0 4px ${BRAND.orange}22` : "none",
                width: first ? 6 : 5,
                height: first ? 6 : 5,
              }} />
            </div>
            <div style={s.tlContent}>
              <div style={s.tlProc}>
                <span style={{ ...s.tlCode, color: first ? BRAND.orange : "#b8b8b8" }}>{proc}</span>
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
    <div style={s.prodWrap}>
      <div style={s.prodHeader} onClick={onToggle}>
        <div style={s.prodLeft}>
          <div style={{
            ...s.prodDot,
            background: isOpen ? BRAND.orange : BRAND.border,
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
  const [openIdx, setOpenIdx] = useState(null)

  // URL에서 bx_lot_no 추출: /cert/BX-260315-01
  const certId = window.location.pathname.split("/cert/")[1] || ""

  const handleVerify = async () => {
    if (!pw.trim()) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${BASE_URL}/cert/${certId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pw }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.detail || "인증 실패")
        setLoading(false)
        return
      }
      const json = await res.json()
      setData(json)
      setVerified(true)
    } catch (e) {
      setError("서버 연결 실패")
    } finally {
      setLoading(false)
    }
  }

  // ── 비밀번호 화면 ──
  if (!verified) {
    return (
      <div style={s.page}>
        <div style={s.pwWrap}>
          <Logo />
          <h1 style={s.pwTitle}>품질증명서</h1>
          <p style={s.pwSub}>제품에 동봉된 비밀번호를 입력해 주세요.</p>
          <div style={{ width: "100%" }}>
            <input
              style={{
                ...s.pwInput,
                borderColor: error ? "#e24b4a" : pw ? BRAND.orange : BRAND.border,
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
            {loading ? "확인 중..." : "확인"}
          </button>
          <p style={s.footerUrl}>lot.mes-fd.com</p>
        </div>
      </div>
    )
  }

  // ── 증명서 화면 ──
  return (
    <div style={s.page}>
      <div style={s.certWrap}>
        {/* 헤더 */}
        <div style={s.certHeader}>
          <Logo />
          <div style={s.certBadge}>Certificate of quality</div>
        </div>

        {/* 박스 정보 */}
        <div style={s.infoGrid}>
          <InfoItem label="Box" value={data?.box_info?.bx_lot_no} />
          <InfoItem label="Shipment" value={data?.box_info?.ob_lot_no} />
          <InfoItem label="Date" value={formatDate(data?.box_info?.created_at)} />
          <InfoItem label="Units" value={`${data?.products?.length || 0}`} />
        </div>

        {/* 구분선 */}
        <div style={s.divRow}>
          <div style={s.divLine} />
          <span style={s.divLabel}>Product traceability</span>
          <div style={s.divLine} />
        </div>

        {/* 제품 목록 */}
        {data?.products?.map((product, idx) => (
          <ProductItem
            key={idx}
            product={product}
            idx={idx}
            total={data.products.length}
            isOpen={openIdx === idx}
            onToggle={() => setOpenIdx(openIdx === idx ? null : idx)}
          />
        ))}

        {/* 푸터 */}
        <div style={s.certFooter}>
          <p style={s.footerText}>
            This certificate verifies the complete manufacturing
            traceability of products contained in this shipment.
          </p>
          <p style={s.footerBrand}>Faraday Dynamics</p>
          <p style={s.footerUrl}>lot.mes-fd.com</p>
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
  // Logo
  logoArea: { display: "flex", alignItems: "center", gap: 10, marginBottom: 48 },
  logoDot: { width: 8, height: 8, borderRadius: "50%", background: BRAND.orange },
  logoText: { fontSize: 13, fontWeight: 650, color: BRAND.dark, letterSpacing: "0.08em", textTransform: "uppercase" },

  // PW Screen
  pwWrap: {
    width: "100%", maxWidth: 380, padding: "72px 24px 40px",
    display: "flex", flexDirection: "column", alignItems: "center",
  },
  pwTitle: { fontSize: 30, fontWeight: 740, color: BRAND.dark, letterSpacing: "-0.03em", margin: "0 0 8px", textAlign: "center" },
  pwSub: { fontSize: 14, color: "#999", lineHeight: 1.55, textAlign: "center", margin: "0 0 44px" },
  pwInput: {
    width: "100%", padding: "14px 0", fontSize: 22, fontWeight: 550,
    letterSpacing: "0.3em", textAlign: "center", border: "none",
    borderBottom: "2px solid #e8e8e8", outline: "none", background: "transparent",
    color: BRAND.dark, transition: "border-color 0.4s", boxSizing: "border-box",
  },
  errText: { fontSize: 12, color: "#e24b4a", margin: "8px 0 0", textAlign: "center" },
  verifyBtn: {
    width: "100%", padding: 15, fontSize: 15, fontWeight: 600,
    color: "#fff", background: BRAND.dark, border: "none",
    borderRadius: 50, cursor: "pointer", transition: "opacity 0.2s", marginTop: 32,
  },

  // Cert Screen
  certWrap: { width: "100%", maxWidth: 460, padding: "52px 28px 40px" },
  certHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 44 },
  certBadge: { fontSize: 10, fontWeight: 650, color: BRAND.orange, letterSpacing: "0.1em", textTransform: "uppercase" },

  // Info
  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "22px 36px", marginBottom: 40 },
  infoLabel: { fontSize: 10, fontWeight: 650, color: "#b0b0b0", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 },
  infoValue: { fontSize: 16, fontWeight: 640, color: BRAND.dark, letterSpacing: "-0.01em" },

  // Divider
  divRow: { display: "flex", alignItems: "center", gap: 14, marginBottom: 28 },
  divLine: { flex: 1, height: 1, background: BRAND.border },
  divLabel: { fontSize: 10, fontWeight: 650, color: "#b0b0b0", letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap" },

  // Product
  prodWrap: { borderBottom: `1px solid #f2f2f2` },
  prodHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 4px", cursor: "pointer", userSelect: "none" },
  prodLeft: { display: "flex", alignItems: "center", gap: 14 },
  prodDot: { width: 7, height: 7, borderRadius: "50%", transition: "background 0.35s", flexShrink: 0 },
  prodLot: { fontSize: 15, fontWeight: 620, color: BRAND.dark, letterSpacing: "-0.01em" },
  prodSub: { fontSize: 11, color: "#b0b0b0", marginTop: 2 },
  prodArrow: { transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center" },

  // Timeline
  tl: { padding: "0 4px 16px 32px" },
  tlRow: { display: "flex", gap: 14, position: "relative" },
  tlLeft: { display: "flex", flexDirection: "column", alignItems: "center", width: 10, flexShrink: 0 },
  tlLine: { width: 1, height: 22 },
  tlDot: { borderRadius: "50%", flexShrink: 0, transition: "all 0.3s" },
  tlContent: { paddingBottom: 14, flex: 1 },
  tlProc: { display: "flex", alignItems: "baseline", gap: 7 },
  tlCode: { fontSize: 11, fontWeight: 720, letterSpacing: "0.05em" },
  tlName: { fontSize: 11, color: "#c8c8c8" },
  tlLot: { fontSize: 13, fontWeight: 540, color: BRAND.dark, marginTop: 2 },

  // Footer
  certFooter: { marginTop: 52, paddingTop: 28, borderTop: `1px solid ${BRAND.border}`, textAlign: "center" },
  footerText: { fontSize: 11, color: "#c0c0c0", lineHeight: 1.65, margin: "0 0 16px" },
  footerBrand: { fontSize: 12, fontWeight: 650, color: BRAND.dark, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 3px" },
  footerUrl: { fontSize: 10, color: "#d0d0d0", margin: 0, marginTop: "auto", paddingTop: 48 },
}