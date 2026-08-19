// src/pages/mypage/MyPage.jsx
// 마이페이지 — 사용자 정보 + 설정(앱 정보 + 서브 뷰 진입) + 프린트 이력
// 뷰: 'main' | 'settings' | 'lines' | 'history'(본인 프린트 이력 3일)

import { useState, useEffect } from 'react'
import { FaradayLogo } from '@/components/FaradayLogo'
import LinesChartPage from '@/pages/process/manage/LinesChartPage'
import InstallModal from '@/components/InstallModal'
import FeedbackForm from './FeedbackForm'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import {
  getMyPrintHistory, reprintLabel,
  listPrinters, getMyPrinter, setMyPrinter, setMyWorkerAutofill,
  getMyFinalPrinter, setMyFinalPrinter, getEnvSensors, getMyEnvSensor, setMyEnvSensor,
  getMyProduction,
} from '@/api'
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
  const [view, setView] = useState('main') // 'main' | 'settings' | 'lines' | 'history' | 'feedback'
  const [autofillOn, setAutofillOn] = useState(() => user?.profile?.worker_autofill !== false)   // 작업자 코드 자동입력 (계정 단위)
  const [autofillBusy, setAutofillBusy] = useState(false)

  // 자동입력 토글 — BE 저장(계정) + 이번 세션 user.profile 즉시 반영(다음 공정 진입 시 반영되게)
  const toggleAutofill = async (on) => {
    if (autofillBusy) return
    setAutofillBusy(true)
    try {
      await setMyWorkerAutofill(on)
      if (user?.profile) user.profile.worker_autofill = on
      setAutofillOn(on)
    } catch {
      // 실패 시 토글 원위치 (setAutofillOn 안 함)
    } finally {
      setAutofillBusy(false)
    }
  }
  const [showInstall, setShowInstall] = useState(false)  // PWA 설치 모달
  const { installed, canInstall } = usePWAInstall()

  // 프린트 이력 — view='history' 진입 시 fetch (2026-04-22)
  const [historyData, setHistoryData] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState(null)
  // 재출력 — lot별 상태 { [lot_num]: 'idle'|'sending'|'ok'|'err' }
  const [reprintState, setReprintState] = useState({})

  // 내 생산 실적 — view='production' 진입 시 fetch (2026-08-19, 회전자 작업일지 기반)
  const [prodData, setProdData] = useState(null)
  const [prodLoading, setProdLoading] = useState(false)
  const [prodError, setProdError] = useState(null)

  // 기본 프린터 설정 — view='settings' 진입 시 로드 (Phase 1, 2026-04-22)
  const [printerList, setPrinterList] = useState([])
  const [myPrinterId, setMyPrinterId] = useState('')
  const [printerSaveMsg, setPrinterSaveMsg] = useState(null)

  // 개인 설정 — 최종 스티커 프린터 / 온습도계 (2026-08-18).
  //   둘 다 '미지정 = 전역 설정을 따름' 이라 빈 값이 정상 상태다.
  const [myFinalPrinterId, setMyFinalPrinterId] = useState('')
  const [envSensorList, setEnvSensorList] = useState([])
  const [myEnvSensorId, setMyEnvSensorId] = useState('')

  useEffect(() => {
    if (view !== 'settings') return
    let alive = true
    ;(async () => {
      try {
        // 온습도계 목록은 권한(QC_ENV_MONITOR)이 없으면 401 이 난다 → 개별 catch 로
        //   그 사람만 온습도 항목이 안 보이게 하고, 프린터 설정은 정상 동작시킨다.
        const [list, mine, finalMine, sensors, sensorMine] = await Promise.all([
          listPrinters({ activeOnly: true }),
          getMyPrinter(),
          getMyFinalPrinter().catch(() => ({ printer: null })),
          getEnvSensors().catch(() => null),
          getMyEnvSensor().catch(() => ({ sensor: null })),
        ])
        if (!alive) return
        setPrinterList(list)
        setMyPrinterId(mine?.printer?.id ?? '')
        setMyFinalPrinterId(finalMine?.printer?.id ?? '')
        setEnvSensorList(sensors?.sensors ?? [])
        setMyEnvSensorId(sensorMine?.sensor?.id ?? '')
      } catch (e) {
        // 세션 오류 등은 handle401이 잡으므로 여기선 조용히 무시
      }
    })()
    return () => { alive = false }
  }, [view])

  const handlePrinterChange = async (raw) => {
    const newId = raw === '' ? null : Number(raw)
    setMyPrinterId(newId ?? '')
    try {
      await setMyPrinter(newId)
      setPrinterSaveMsg('저장됨')
    } catch (e) {
      setPrinterSaveMsg(`저장 실패: ${e.message}`)
    }
    setTimeout(() => setPrinterSaveMsg(null), 1800)
  }

  // 최종 스티커 프린터 / 온습도계 — 저장 메시지는 프린터와 공유(같은 '출력·검사 설정' 블록)
  const handleFinalPrinterChange = async (raw) => {
    const newId = raw === '' ? null : Number(raw)
    setMyFinalPrinterId(newId ?? '')
    try {
      await setMyFinalPrinter(newId)
      setPrinterSaveMsg('저장됨')
    } catch (e) {
      setPrinterSaveMsg(`저장 실패: ${e.message}`)
    }
    setTimeout(() => setPrinterSaveMsg(null), 1800)
  }

  const handleEnvSensorChange = async (raw) => {
    const newId = raw === '' ? null : Number(raw)
    setMyEnvSensorId(newId ?? '')
    try {
      await setMyEnvSensor(newId)
      setPrinterSaveMsg('저장됨')
    } catch (e) {
      setPrinterSaveMsg(`저장 실패: ${e.message}`)
    }
    setTimeout(() => setPrinterSaveMsg(null), 1800)
  }

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

  useEffect(() => {
    if (view !== 'production') return
    let alive = true
    setProdLoading(true)
    setProdError(null)
    getMyProduction()
      .then((d) => { if (alive) setProdData(d) })
      .catch((e) => { if (alive) setProdError(e.message || '조회 실패') })
      .finally(() => { if (alive) setProdLoading(false) })
    return () => { alive = false }
  }, [view])

  // 서브 뷰: 피드백 (에러 신고 / 개선 제안, 2026-05-07)
  if (view === 'feedback') {
    return <FeedbackForm onClose={() => setView('main')} />
  }

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

  // 서브 뷰: 내 생산 실적 — 본인(worker_code) 기준 회전자 작업일지 집계 (2026-08-19)
  if (view === 'production') {
    const d = prodData
    return (
      <div className="page">
        <div className={`card ${s.card}`}>
          <div className={s.settingsHeader}>
            <span className={s.settingsTitle}>내 생산 실적</span>
            <button className={s.closeBtn} onClick={() => setView('main')} aria-label="닫기">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <p className={s.historyMeta}>
            회전자 작업일지 기준
            {(d?.worker_code || user?.profile?.worker_code) && ` · 작업자 ${d?.worker_code || user?.profile?.worker_code}`}
          </p>

          {prodLoading && <p className={s.historyEmpty}>불러오는 중...</p>}
          {prodError && <p className={s.historyError}>⚠ {prodError}</p>}

          {d && !prodLoading && d.has_code === false && (
            <p className={s.historyEmpty}>개인 작업자 코드가 없어 실적을 볼 수 없어요.</p>
          )}

          {d && !prodLoading && d.has_code && (
            <>
              <div className={s.prodTiles}>
                {[['오늘', d.today], ['이번주', d.week], ['이번달', d.month]].map(([label, v]) => (
                  <div key={label} className={s.prodTile}>
                    <span className={s.prodTileLabel}>{label}</span>
                    <span className={s.prodTileQty}>{v.qty}</span>
                    <span className={s.prodTileSub}>{v.lots} LOT</span>
                  </div>
                ))}
              </div>

              {d.by_process.length > 0 && (
                <div className={s.prodSection}>
                  <div className={s.prodSectionTitle}>이번달 공정별</div>
                  {d.by_process.map((p) => (
                    <div key={p.process} className={s.prodProcRow}>
                      <span className={s.prodProcLabel}>{p.label}</span>
                      <span className={s.prodProcVal}>{p.qty}개 · {p.lots} LOT</span>
                    </div>
                  ))}
                </div>
              )}

              <div className={s.prodSection}>
                <div className={s.prodSectionTitle}>최근 생산</div>
                {d.recent.length === 0 && (
                  <p className={s.historyEmpty}>이번달 생산 기록이 없어요.</p>
                )}
                {d.recent.map((r, i) => (
                  <div key={`${r.lot_no}-${i}`} className={s.prodRecentRow}>
                    <span className={s.prodRecentLot}>{r.lot_no}</span>
                    <span className={s.prodRecentMeta}>
                      {r.process_label}{r.product ? ` · ${r.product}` : ''}
                    </span>
                    <span className={s.historyTime}>{formatHistoryTime(r.at)}</span>
                  </div>
                ))}
              </div>
            </>
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

          {/* ── 출력 설정 — 기본 프린터 (Phase 1, 2026-04-22) ── */}
          <div className={s.section}>
            <div className={s.sectionTitle}>출력</div>
            <div className={s.infoRow}>
              <span className={s.infoKey}>기본 프린터</span>
              <select
                className={s.printerSelect}
                value={myPrinterId}
                onChange={(e) => handlePrinterChange(e.target.value)}
              >
                <option value="">(지정 안 함)</option>
                {printerList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {/* 최종 스티커(소형 라벨) 프린터 — 개인 설정 (2026-08-18).
                미지정이면 프린터 관리의 전역 설정을 따른다. */}
            <div className={s.infoRow}>
              <span className={s.infoKey}>스티커 프린터</span>
              <select
                className={s.printerSelect}
                value={myFinalPrinterId}
                onChange={(e) => handleFinalPrinterChange(e.target.value)}
              >
                <option value="">(전체 설정 따름)</option>
                {printerList.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            {/* 온습도계 — OQ 선간저항 온도보정용. 목록을 못 받으면(권한 없음) 숨긴다. */}
            {envSensorList.length > 0 && (
              <div className={s.infoRow}>
                <span className={s.infoKey}>온습도계</span>
                <select
                  className={s.printerSelect}
                  value={myEnvSensorId}
                  onChange={(e) => handleEnvSensorChange(e.target.value)}
                >
                  <option value="">(전체 설정 따름)</option>
                  {envSensorList.map((sn) => (
                    <option key={sn.id} value={sn.id}>
                      {sn.name || sn.key}{sn.location ? ` — ${sn.location}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {printerSaveMsg && (
              <div className={s.savedMsg}>{printerSaveMsg}</div>
            )}
            <div className={s.savedMsg}>
              스티커 프린터·온습도계는 비워두면 전체 설정을 따릅니다.
              온습도계는 출하검사 선간저항을 20℃ 기준으로 환산할 때 씁니다.
            </div>
          </div>

          {/* ── 입력 — 작업자 코드 자동입력 (PERSON + 코드 보유 시만, 2026-07-30) ── */}
          {user?.account_type === 'PERSON' && user?.profile?.worker_code && (
            <div className={s.section}>
              <div className={s.sectionTitle}>입력</div>
              <label className={s.infoRow} style={{ cursor: 'pointer' }}>
                <span className={s.infoKey}>작업자 코드 자동입력</span>
                <input type="checkbox" checked={autofillOn} disabled={autofillBusy}
                  onChange={(e) => toggleAutofill(e.target.checked)} />
              </label>
              <div className={s.savedMsg}>
                {autofillOn
                  ? `공정 화면에서 내 작업자 코드(${user.profile.worker_code})를 자동으로 채워요.`
                  : '작업자 코드를 직접 입력합니다 (자동입력 꺼짐).'}
              </div>
            </div>
          )}

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

        {/* 내 생산 실적 — 개인계정(PERSON + 작업자 코드)만. 회전자 작업일지 기반 (2026-08-19) */}
        {user?.account_type === 'PERSON' && user?.profile?.worker_code && (
          <button
            className={s.settingsBtn}
            onClick={() => setView('production')}
          >
            <span>📊 내 생산 실적</span>
            <span className={s.linkArrow}>›</span>
          </button>
        )}

        {/* 본인 프린트 이력 — 최근 3일 (2026-04-22) */}
        <button
          className={s.settingsBtn}
          onClick={() => setView('history')}
        >
          <span>📋 내 프린트 이력</span>
          <span className={s.linkArrow}>›</span>
        </button>

        {/* 에러 신고 / 개선 제안 (2026-05-07) */}
        <button
          className={s.settingsBtn}
          onClick={() => setView('feedback')}
        >
          <span>📝 피드백 보내기</span>
          <span className={s.linkArrow}>›</span>
        </button>

        <button className="btn-ghost btn-sm" onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </div>
  )
}
