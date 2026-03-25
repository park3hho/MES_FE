// src/pages/ExportPage.jsx
// ★ 검사 데이터 엑셀 내보내기 — OB 목록 + 검색 + 상세 + 다운로드
// 호출: App.jsx → ADM 메뉴에서 EXPORT 선택

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaradayLogo } from '@/components/FaradayLogo'
import s from './ExportPage.module.css'

const BASE_URL = import.meta.env.VITE_API_URL || '' // ★ 이 줄 추가

// ── 판정 배지 색상 ──
const judgmentColor = (j) => (j === 'OK' ? '#1a9e75' : '#c0392b')

// ── 파이 색상 ──
const phiColor = { 87: '#FF69B4', 70: '#FFB07C', 45: '#F0D000', 20: '#77DD77' }

// ── 스프링 트랜지션 (토스 스타일) ──
const spring = { type: 'spring', stiffness: 400, damping: 30 }
const stagger = { staggerChildren: 0.06 }

// ── 카드 애니메이션 variants ──
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: spring },
  exit: { opacity: 0, y: -10, scale: 0.97, transition: { duration: 0.15 } },
}

// ── 상세 펼침 variants ──
const detailVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: { ...spring, stiffness: 300 } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.2 } },
}

// ── 제품 행 variants ──
const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: spring },
}

export default function ExportPage({ onLogout, onBack }) {
  const [obList, setObList] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedOb, setExpandedOb] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [downloading, setDownloading] = useState(null)

  // ── 초기 로딩: OB 목록 ──
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch(`${BASE_URL}/lot/ob/list`, { credentials: 'include' })
        if (res.ok) setObList(await res.json())
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // ── OB 카드 클릭 → 상세 토글 ──
  const toggleDetail = async (obLotNo) => {
    if (expandedOb === obLotNo) {
      setExpandedOb(null)
      setDetail(null)
      return
    }
    setExpandedOb(obLotNo)
    setDetailLoading(true)
    try {
      const res = await fetch(`${BASE_URL}/lot/ob/${obLotNo}/detail`, { credentials: 'include' })
      if (res.ok) setDetail(await res.json())
    } catch (e) {
      console.error(e)
    } finally {
      setDetailLoading(false)
    }
  }

  // ── 엑셀 다운로드 ──
  const handleDownload = async (obLotNo, e) => {
    e.stopPropagation()
    setDownloading(obLotNo)
    try {
      const res = await fetch(`${BASE_URL}/lot/ob/${obLotNo}/export`, { credentials: 'include' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inspection_${obLotNo}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`다운로드 실패: ${err.message}`)
    } finally {
      setDownloading(null)
    }
  }

  // ── 검색 필터 ──
  const filtered = obList.filter((ob) => ob.ob_lot_no.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className={s.page}>
      <div className={s.container}>
        {/* 헤더 */}
        <motion.div
          className={s.header}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
        >
          <FaradayLogo size="md" />
          <p className={s.title}>검사 데이터 내보내기</p>
          <p className={s.sub}>
            출하 번호를 선택하면 포함된 제품을 확인하고 엑셀로 다운로드할 수 있습니다.
          </p>
        </motion.div>

        {/* 검색바 */}
        <motion.div
          className={s.searchWrap}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...spring, delay: 0.1 }}
        >
          <span className={s.searchIcon}>🔍</span>
          <input
            className={s.searchInput}
            type="text"
            placeholder="OB 번호 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <motion.button
              className={s.clearBtn}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={spring}
              onClick={() => setSearch('')}
            >
              ✕
            </motion.button>
          )}
        </motion.div>

        {/* 목록 */}
        {loading ? (
          <motion.div className={s.loadingWrap} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className={s.spinner} />
            <span>불러오는 중...</span>
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.p className={s.empty} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {search ? `"${search}" 검색 결과 없음` : '출하 이력이 없습니다'}
          </motion.p>
        ) : (
          <div className={s.list}>
            {filtered.map((ob) => (
              <div key={ob.ob_lot_no} className={s.card} onClick={() => toggleDetail(ob.ob_lot_no)}>
                <div className={s.cardHeader}>
                  <span className={s.obNo}>{ob.ob_lot_no}</span>
                  <span className={s.badge}>{ob.product_count}개</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 하단 버튼 */}
        <motion.button
          className={s.backBtn}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={onBack ?? onLogout}
        >
          {onBack ? '← 이전으로' : '로그아웃'}
        </motion.button>
      </div>
    </div>
  )
}
