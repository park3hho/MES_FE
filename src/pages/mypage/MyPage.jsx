// src/pages/mypage/MyPage.jsx
// 마이페이지 — 사용자 정보 + 설정(앱 정보 + 서브 뷰 진입) + 프린트 이력
// 뷰: 'main' | 'settings' | 'lines' | 'history'(본인 프린트 이력 3일)

import { useState, useEffect } from 'react'
import { FaradayLogo } from '@/components/FaradayLogo'
import LinesChartPage from '@/pages/adm/manage/LinesChartPage'
import InstallModal from '@/components/InstallModal'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { getMyPrintHistory, reprintLabel } from '@/api'
import s from './MyPage.module.css'

// vite.config.js define 으로 주입되는 전역 상수 (빌드 시점)
// eslint-disable-next-line no-undef
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
// eslint-disable-next-line no-undef
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : ''

// ISO → "2026-04-15 17:23"
const formatBuildTime = (iso) => {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

// ISO → "04/22 14:33" — 프린트 이력 간결 포맷 (최근 3일이라 연도 생략)
const formatHistoryTime = (iso) => {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

export default function MyPage({ user, onLogout }) {
  const [view, setView] = useState('main') // 'main' | 'settings' | 'lines' | 'history'
  const [showInstall, setShowInstall] = useState(false)  // PWA 설치 모달
  const { installed, canInstall } = usePWAInstall()

  // 프린트 이력 — view='history' 진입 시 fetch (2026-04-22)
  const [historyData, setHistoryData] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)
  // 재출력 — lot별 상태 { [lot_num]: 'idle'|'sending'|'ok'|'err' }
  const [reprintState, setReprintState] = useState({})

  const handleReprint = async (lotNum) => {
    setReprintState((prev) => ({ ...prev, [lotNum]: 'sending' }))
    try {
      await reprintLabel(lotNum)
      setReprintState((prev) => ({ ...prev, [lotNum]: 'ok' }))
      setTimeout(() => {
        setReprintState((prev) => {
          const { [lotNum]: _, ...rest } = prev
          return rest
        })
      }, 1800)
    } catch (e) {
      setReprintState((prev) => ({ ...prev, [lotNum]: 'err' }))
      console.error('재출력 실패:', e)
      setTimeout(() => {
        setReprintState((prev) => {
          const { [lotNum]: _, ...rest } = prev
          return rest
        })
      }, 2500)
    }
  }

  useEffect(() => {
    if (view !== 'history') return
    let alive = true
    setHistoryLoading(true)
    setHistoryError(null)
    getMyPrintHistory()
      .then((d) => { if (alive) setHistoryData(d) })
      .catch((e) => { if (alive) setHistoryError(e.message || '조회 실패') })
      .finally(() => { if (alive) setHistoryLoading(false) })
    return () => { alive = false }
  }, [view])

  // 서브 뷰: 코드 라인 추이 (설정에서 진입)
  if (view === 'lines') {
    return (
      <LinesChartPage
        onLogout={onLogout}
        onBack={() => setView('settings')}
      />
    )
  }

  // 서브 뷰: 내 프린트 이력 — 본인(machine_id) 기준 최근 3일 (2026-04-22)
  if (view === 'history') {
    return (
      <div className="page">
        <div className={`card ${s.card}`}>
          <div className={s.settingsHeader}>
            <span className={s.settingsTitle}>내 프린트 이력</span>
            <button
              className={s.closeBtn}
              onClick={() => setView('main')}
              aria-label="닫기"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className={s.historyMeta}>
            본인 기준 최근 {historyData?.window_days || 3}일
            {historyData && !historyLoading && ` · ${historyData.count}건`}
          </p>

          {historyLoading && <p className={s.historyEmpty}>불러오는 중...</p>}
          {historyError && <p className={s.historyError}>⚠ {historyError}</p>}

          {historyData && !historyLoading && historyData.items.length === 0 && (
            <p className={s.historyEmpty}>최근 3일간 프린트 이력이 없어요.</p>
          )}

          {historyData && !historyLoading && historyData.items.length > 0 && (
            <ul className={s.historyList}>
              {historyData.items.map((item) => {
                const st = reprintState[item.lot_num]
                const btnLabel =
                  st === 'sending' ? '전송 중…'
                  : st === 'ok' ? '✓ 완료'
                  : st === 'err' ? '⚠ 실패'
                  : '재출력'
                return (
                  <li key={item.id} className={s.historyItem}>
                    <div className={s.historyMain}>
                      <span className={s.historyLot}>{item.lot_num}</span>
                      {item.print_count > 1 && (
                        <span className={s.historyCount}>×{item.print_count}</span>
                      )}
                    </div>
                    <span className={s.historyTime}>{formatHistoryTime(item.printed_at)}</span>
                    <button
                      type="button"
                      className={`${s.reprintBtn} ${st === 'ok' ? s.reprintBtnOk : ''} ${st === 'err' ? s.reprintBtnErr : ''}`}
                      disabled={st === 'sending' || st === 'ok'}
                      onClick={() => handleReprint(item.lot_num)}
                    >
                      {btnLabel}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // 서브 뷰: 설정
  if (view === 'settings') {
    return (
      <div className="page">
        <div className={`card ${s.card}`}>
          <div className={s.settingsHeader}>
            <span className={s.settingsTitle}>설정</span>
            <button className={s.closeBtn} onClick={() => setView('main')} aria-label="닫기">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* ── 앱 정보 ── */}
          <div className={s.section}>
            <div className={s.sectionTitle}>앱 정보</div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>버전</span>
              <span className={s.infoVal}>{APP_VERSION}</span>
            </div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>빌드</span>
              <span className={s.infoVal}>{formatBuildTime(BUILD_TIME)}</span>
            </div>
          </div>

          {/* ── 메뉴 ── */}
          <div className={s.section}>
            <div className={s.sectionTitle}>앱</div>
            {/* PWA 설치 — Android 설치 가능 or iOS Safari 감지 시 노출 */}
            {(canInstall || installed) && (
              <button className={s.linkBtn} onClick={() => setShowInstall(true)}>
                <span>{installed ? '✅ 앱 설치됨' : '📲 앱으로 설치'}</span>
                <span className={s.linkArrow}>›</span>
              </button>
            )}
          </div>

          <div className={s.section}>
            <div className={s.sectionTitle}>개발</div>
            <button className={s.linkBtn} onClick={() => setView('lines')}>
              <span>📊 코드 라인 추이</span>
              <span className={s.linkArrow}>›</span>
            </button>
          </div>
        </div>

        {/* PWA 설치 모달 */}
        {showInstall && <InstallModal onClose={() => setShowInstall(false)} />}
      </div>
    )
  }

  // 메인 뷰
  return (
    <div className="page">
      <div className={`card ${s.card}`}>
        {/* 우상단 설정 톱니 */}
        <button
          className={s.gearBtn}
          onClick={() => setView('settings')}
          aria-label="설정"
          title="설정"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        <FaradayLogo size="sm" />

        <div className={s.avatar}>👤</div>
        <h2 className={s.name}>{user?.id || '사용자'}</h2>
        <p className={s.loginId}>{user?.login_id || '-'}</p>

        {/* 본인 프린트 이력 — 최근 3일 (2026-04-22) */}
        <button
          className={s.settingsBtn}
          onClick={() => setView('history')}
        >
          <span>📋 내 프린트 이력</span>
          <span className={s.linkArrow}>›</span>
        </button>

        <button className="btn-ghost btn-sm" onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </div>
  )
}
