// pages/dashboard/RotorBoardPage.jsx
// 회전자 현황판 (2026-09-11) — 현장 엑셀 'Meta 제품 재공/재고 현황' 의 **회전자 표만** 옮긴 화면.
//
// ★ 화면이 답하는 것 하나: "지금 회전자가 어느 단계에 몇 개 있나" — 모델(Φ)별로.
//   기간 합계가 아니라 **현재 잔량**이다. 그래서 날짜 필터가 없다(있으면 뜻이 달라진다).
//
// ★ 행 정의는 BE rotor_board_service 가 소유한다 — label/sub 를 응답에서 받아 그대로 쓴다.
//   여기서 다시 정의하면 정의가 두 벌이 되어 조용히 어긋난다(일일 마감·재고 화면과도 같은 규칙).
//
// ★ 열은 **활성 모델 전부 고정** — 값이 0 이어도 열을 남긴다(사용자 결정 2026-09-11).
//   벽 모니터로 띄우는 화면이라 열이 날마다 생겼다 사라지면 오히려 헷갈린다.
//
// ★ 라벨은 **Φ 숫자만** — 사용자 결정("Mini Small Medium 이런 네이밍 빼고 몇파이 제품인지만").
//   예전엔 sheet_name 을 썼는데, 같은 Φ 에 sheet_name 이 빈 RT 행이 함께 등록돼 있어(운영 확인 2026-09-11)
//   모델 목록 순서에 따라 같은 열이 'Mini' 도 'Φ20' 도 될 수 있었다.
//
// ★ 폰(≤480px)은 전용 화면(아래 MobileBoard) — 행 = 단계, 열 = **재공이 있는 모델만** (사용자 선택 ①안 2026-09-11).
//   PC 방향 그대로 활성 모델 7종을 다 세우면 가로로 폰 화면 두 배 넘게 밀린다.
//   (1차 수정 = 행·열 뒤집은 표는 실기에서 "못생겼다"로 교체 — 목업 3안 → 표 형태 → ①안)
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

import PageHeader from '@/components/common/PageHeader'
import { getRotorBoard } from '@/api'
import { DASHBOARD_POLL_MS } from '@/constants/etcConst'
import { useMobile } from '@/hooks/useMobile'
import { useModels } from '@/hooks/useModels'
import s from './RotorBoardPage.module.css'

// BE rotor_board_service.UNCLASSIFIED 와 같은 값 — Φ 미입력 재공품.
//   열에서 빼지 않고 맨 뒤에 둔다. 있는데 안 보이면 소계·합계가 안 맞는다.
const UNCLASSIFIED = '-'

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const fmt = (v) => num(v).toLocaleString()

// Φ 정렬 — 숫자 오름차순, 미분류는 항상 맨 뒤. BE _phi_sort 와 같은 규약.
const phiRank = (phi) => (phi === UNCLASSIFIED ? Number.MAX_SAFE_INTEGER : (Number(phi) || 9999))

// presenting — 보기 전용: 뒤로가기 등 조작 UI 를 감춘다.
// fitScreen  — 한 화면(100vh)에 눌러 담는 압축 레이아웃.
//   ★ 둘을 나눈 이유는 BlanketDashboardPage 주석 참조 (위젯 임베드 시 후자를 켜면 슬롯을 무시한다).
export default function RotorBoardPage({ onBack, presenting = false, fitScreen = false }) {
  const { models } = useModels()
  const isMobile = useMobile()
  // 벽 모니터 압축(fitScreen)은 PC 표 그대로 — 폰 전용 화면은 폰에서만.
  const mobile = isMobile && !fitScreen
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)
  // 응답 순서 보장 — silent(폴링)는 토큰을 올리지 않는다.
  //   올리면 1시간 타이머가 사용자의 진행 중 조회를 무효화해 스피너가 안 꺼진다 (2026-09-07 규약).
  const reqRef = useRef(0)

  const load = useCallback(async (opts) => {
    const silent = opts?.silent === true
    const token = silent ? reqRef.current : ++reqRef.current
    if (!silent) { setLoading(true); setError(null) }
    try {
      const d = await getRotorBoard()
      if (token !== reqRef.current) return
      setData(d)
      setFetchedAt(Date.now())
    } catch (e) {
      if (token !== reqRef.current) return
      // 폴링 실패는 조용히 — 보고 있던 화면을 에러로 갈아치우지 않는다.
      //   대신 fetchedAt 이 안 갱신되므로 '업데이트' 시각이 낡은 채로 남아 티가 난다.
      if (!silent) { setData(null); setError(e.message || '조회 실패') }
    } finally {
      if (token === reqRef.current && !silent) setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // 띄워놓고 보는 화면 — 1시간마다 조용히 갱신 (2026-09-07 규약)
  useEffect(() => {
    const t = setInterval(() => load({ silent: true }), DASHBOARD_POLL_MS)
    return () => clearInterval(t)
  }, [load])

  // 열 — 활성 모델의 Φ(고정) ∪ 응답에 값이 있는 Φ.
  //   ★ 응답 쪽을 합집합에 넣는 이유: 모델이 비활성으로 바뀌어도 재공품은 현장에 남아 있다.
  //     빠뜨리면 열에는 없는데 소계에는 잡혀 "합이 안 맞는 표"가 된다.
  const columns = useMemo(() => {
    const phis = new Set()
    for (const m of models || []) {
      if (m.is_active === false) continue
      const p = String(m.phi ?? '').trim()
      if (p) phis.add(p)
    }
    for (const p of data?.phis || []) phis.add(p)

    return [...phis]
      .sort((a, b) => phiRank(a) - phiRank(b))
      .map((phi) => ({ phi, label: phi === UNCLASSIFIED ? '미분류' : `Φ${phi}` }))
  }, [models, data])

  // Φ → 모델 등록색(ModelRegistry.color_hex) — 폰 화면의 점에만 쓴다.
  //   같은 Φ 의 ST/RT 행은 색이 같게 등록돼 있다(운영 확인 2026-09-11) → 첫 활성 모델 색.
  const colorOf = useMemo(() => {
    const map = new Map()
    for (const m of models || []) {
      if (m.is_active === false || !m.color_hex) continue
      const p = String(m.phi ?? '').trim()
      if (p && !map.has(p)) map.set(p, m.color_hex)
    }
    return map
  }, [models])

  const stages = data?.stages || []

  return (
    // 보기 전용(현황판) — 전체화면이면 한 화면에 눌러 담고 조작 UI 를 감춘다 (2026-09-02 규약)
    <div className={`page-flat ${fitScreen ? s.present : ''}`}>
      <PageHeader
        title="회전자는 지금 어디에 있나요?"
        subtitle={presenting ? ''
          : mobile ? '누계가 아니라 지금 남아 있는 수량이에요'
            : '단계별 재공 잔량 · 모델별 — 기간 합계가 아니라 현재 시점'}
        onBack={presenting ? undefined : onBack}
      />

      <div className={`page-content ${fitScreen ? s.presentBody : ''}`}>
        {/* 폰 화면은 기준 시각을 전체 합계 옆에 따로 둔다 (MobileBoard) */}
        {fetchedAt && !loading && !error && !mobile && (
          <p className={s.stamp}>업데이트 {new Date(fetchedAt).toLocaleTimeString('ko-KR')}</p>
        )}

        {loading && <p className={s.msg}>불러오는 중…</p>}
        {error && <p className={s.err}>{error}</p>}

        {!loading && !error && data && (
          stages.length === 0 || columns.length === 0 ? (
            <p className={s.msg}>표시할 회전자 재공품이 없습니다.</p>
          ) : mobile ? (
            <MobileBoard columns={columns} stages={stages} data={data} colorOf={colorOf} fetchedAt={fetchedAt} />
          ) : (
            <>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <caption className={s.caption}>회전자</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={s.rowHead}>단계</th>
                      {columns.map((c) => (
                        <th key={c.phi} scope="col" className={s.colHead}>{c.label}</th>
                      ))}
                      <th scope="col" className={`${s.colHead} ${s.subtotalHead}`}>소계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stages.map((st) => (
                      <tr key={st.key}>
                        <th scope="row" className={s.rowHead}>
                          <span className={s.stageLabel}>{st.label}</span>
                          {st.sub && <span className={s.stageSub}>{st.sub}</span>}
                        </th>
                        {columns.map((c) => {
                          const v = num(st.cells?.[c.phi])
                          return (
                            <td key={c.phi} className={`${s.cell} ${v === 0 ? s.zero : ''}`}>
                              {fmt(v)}
                            </td>
                          )
                        })}
                        <td className={`${s.cell} ${s.subtotal}`}>{fmt(st.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className={s.totalRow}>
                      <th scope="row" className={s.rowHead}>회전자 합계</th>
                      {columns.map((c) => (
                        <td key={c.phi} className={s.cell}>{fmt(data.totals?.[c.phi])}</td>
                      ))}
                      <td className={`${s.cell} ${s.subtotal}`}>{fmt(data.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className={s.note}>
                각 칸은 <b>지금 그 단계에 남아 있는 수량</b>입니다 — 만든 개수의 누계가 아닙니다.
                단계 판정은 일일 마감·회전자 재고 화면과 같은 규칙을 씁니다.
              </p>
            </>
          )
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 폰 전용 화면 — 행 = 단계, 열 = 재공이 있는 모델 (사용자 선택 ①안, 2026-09-11)
// ─────────────────────────────────────────
// ★ 모듈 스코프 컴포넌트 — 부모 변수는 참조하지 말고 전부 props 로 받을 것.
//   FinishedInventoryPage 의 `presenting is not defined` 크래시가 바로 이 실수였다 (2026-09-11).
// ★ 열은 재공이 있는 모델만 — 좁은 폰에서 0 열이 숫자 칸을 밀어내 표가 넘치고 지저분해진다.
//   0 인 모델은 표 아래 '재공 없음' 한 줄로 모은다 — 숨기면 "그 모델은 어디 갔나" 가 된다.
// ★ 모델이 6개 이상 차면 글씨를 한 단계 줄이고(.mDense), 그래도 넘치면 표만 가로로 민다(단계 열 고정).
// ★ 캡션('회전자')·하단 안내문은 뺀다 — 제목·부제목과 같은 말이라 폰에선 길이만 늘린다.
function MobileBoard({ columns, stages, data, colorOf, fetchedAt }) {
  const live = columns.filter((c) => num(data.totals?.[c.phi]) > 0)
  const idle = columns.filter((c) => num(data.totals?.[c.phi]) <= 0)
  // 모델 등록색은 점에만 — Φ20·Φ45 같은 연한 색은 흰 바탕 글씨로 쓰면 안 읽힌다 (2026-09-09 규약)
  const dot = (phi) => (
    <i className={s.mDot} style={{ background: colorOf.get(phi) || 'var(--color-gray-light)' }} />
  )

  return (
    <>
      <div className={s.mHero}>
        <div>
          <div className={s.mHeroLabel}>전체</div>
          <div className={s.mHeroNum}>{fmt(data.total)}<small>개</small></div>
        </div>
        {fetchedAt && (
          <div className={s.mStamp}>
            {new Date(fetchedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} 기준
          </div>
        )}
      </div>

      {live.length > 0 && (
        <div className={s.mScroll}>
          <table className={`${s.mTable} ${live.length >= 6 ? s.mDense : ''}`}>
            <thead>
              <tr>
                <th scope="col">단계</th>
                {live.map((c) => (
                  <th key={c.phi} scope="col">{dot(c.phi)}{c.label}</th>
                ))}
                <th scope="col" className={s.mTot}>합계</th>
              </tr>
            </thead>
            <tbody>
              {stages.map((st) => {
                const t = num(st.total)
                return (
                  <tr key={st.key}>
                    <th scope="row">
                      <span className={s.mStage}>{st.label}</span>
                      {st.sub && <span className={s.mStageSub}>{st.sub}</span>}
                    </th>
                    {live.map((c) => {
                      const v = num(st.cells?.[c.phi])
                      return (
                        <td key={c.phi} className={v === 0 ? s.mZero : undefined}>
                          {v === 0 ? '–' : fmt(v)}
                        </td>
                      )
                    })}
                    <td className={`${s.mTot} ${t === 0 ? s.mZero : ''}`}>{t === 0 ? '–' : fmt(t)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">합계</th>
                {live.map((c) => (
                  <td key={c.phi}>{fmt(data.totals?.[c.phi])}</td>
                ))}
                <td className={s.mTot}>{fmt(data.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {idle.length > 0 && (
        <div className={s.mIdle}>
          <b>재공 없음</b>
          {idle.map((c) => (
            <span key={c.phi}>{dot(c.phi)}{c.label}</span>
          ))}
        </div>
      )}
    </>
  )
}
