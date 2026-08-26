// pages/dashboard/MyDashboardPage.jsx
// 내 대시보드 (대시보드 커스텀, 2026-08-26) — 기존 대시보드 페이지들을 위젯으로 조합.
//   배경: 사용자가 브라우저 3창(포장 현황·실시간 재고·계약 소진)을 나란히 띄워 쓰던 것을
//   한 화면에서. 목업 = artifact c579331b (v2.1 — 경계선 없이 위쪽 얇은 선 하나).
//
// ★ 위젯 = 원본 페이지 컴포넌트 그대로 임베드 (레지스트리 boardWidgets.jsx 가 진실의 원천).
//   각 페이지가 자기 폴링·권한 API 를 그대로 쓰므로 이 화면은 배치만 담당한다.
// ★ 저장 = 계정별 서버 (GET/PUT /my/dashboard) — 현장은 PC·태블릿을 오가므로 기기별
//   localStorage 면 "내 보드" 가 아니게 된다. 저장 실패는 토스트로 알리되 화면은 유지
//   (다음 변경에서 다시 시도되는 셈 — 통째 교체 PUT 이라 유실 없음).
// ★ 권한: 보드 렌더·카탈로그 모두 canAccess 필터 — 권한이 회수된 위젯은 자동으로 안 보인다
//   (저장값에서 지우지는 않는다 — 권한이 돌아오면 보드도 그대로 돌아와야 하므로).
import { useCallback, useEffect, useRef, useState } from 'react'

import { getMyDashboard, saveMyDashboard } from '@/api'
import { canAccess } from '@/constants/permissions'
import { useToast } from '@/contexts/ToastContext'
import {
  BOARD_WIDGETS, WIDGET_GROUPS, SIZE_SPAN, SIZE_LABEL, DEFAULT_BOARD,
} from './boardWidgets'
import s from './MyDashboardPage.module.css'

export default function MyDashboardPage({ user, logout }) {
  const [board, setBoard] = useState(null)   // null = 로딩 중
  const [editing, setEditing] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // GET 실패 시 편집 잠금 (2026-08-26 리뷰 fix) — 실패 폴백(기본 구성)인 채로 편집을 허용하면
  //   통째-교체 PUT 이 사용자의 진짜 저장 보드를 기본 구성으로 덮어쓴다.
  const [loadFailed, setLoadFailed] = useState(false)
  const toast = useToast()
  const dragFrom = useRef(null)

  useEffect(() => {
    let alive = true
    getMyDashboard()
      .then((r) => { if (alive) setBoard(r.board ?? DEFAULT_BOARD.map((w) => ({ ...w }))) })
      .catch(() => {
        if (!alive) return
        setLoadFailed(true)
        setBoard(DEFAULT_BOARD.map((w) => ({ ...w })))
      })
    return () => { alive = false }
  }, [])

  // 변경 확정 — 화면 먼저, 저장은 뒤에서 (실패해도 화면 유지 + 토스트)
  const commit = useCallback((next) => {
    setBoard(next)
    saveMyDashboard(next).catch((e) => toast(`보드 저장 실패: ${e.message}`, 'error'))
  }, [toast])

  // ★ 이동은 '화면상 이웃' 기준 (2026-08-26 리뷰 fix) — board 인덱스 인접 스왑이면
  //   권한 필터로 숨은 위젯이 사이에 있을 때 첫 클릭이 화면상 무동작이 된다.
  const move = (bIdx, dir) => {
    const vis = board
      .map((w, i) => ({ i, ok: !!BOARD_WIDGETS[w.id] && canAccess(user, BOARD_WIDGETS[w.id].feature) }))
      .filter((x) => x.ok).map((x) => x.i)
    const vi = vis.indexOf(bIdx)
    const targetB = vis[vi + dir]
    if (vi < 0 || targetB == null) return
    const next = [...board]
    const [moved] = next.splice(bIdx, 1)
    // 제거 후 인덱스: dir=+1 이면 target 이 한 칸 당겨져 targetB 삽입 = target 바로 뒤,
    //   dir=-1 이면 target 위치 불변이라 targetB 삽입 = target 바로 앞 — 양쪽 다 targetB.
    next.splice(targetB, 0, moved)
    commit(next)
  }
  const cycleSize = (idx) => {
    const next = board.map((w, i) => (i === idx ? { ...w, size: w.size === 3 ? 1 : w.size + 1 } : w))
    commit(next)
  }
  const remove = (idx) => {
    const d = BOARD_WIDGETS[board[idx].id]
    commit(board.filter((_, i) => i !== idx))
    toast(`'${d?.name || board[idx].id}' 를 보드에서 뺐어요`)
  }
  const add = (id) => {
    // ★ 스크롤 보존 (2026-08-26 리뷰 fix) — 새 위젯이 마운트되면 그 안의 PageHeader 가
    //   window.scrollTo(0,0) 을 쏴서 배경이 최상단으로 점프한다. effect 실행 시점이
    //   rAF 앞뒤로 갈릴 수 있어 두 타이밍 모두에서 복원한다.
    const y = window.scrollY
    const restore = () => window.scrollTo(0, y)
    commit([...board, { id, size: 2 }])
    requestAnimationFrame(restore)
    setTimeout(restore, 60)
    toast(`'${BOARD_WIDGETS[id].name}' 를 보드에 담았어요`)
  }
  const reset = () => commit(DEFAULT_BOARD.map((w) => ({ ...w })))

  // 드래그 정렬 — 편집 모드 한정. 인덱스는 ref 로 (dataTransfer 는 dragover 중 못 읽는 브라우저가 있다)
  const onDrop = (toIdx) => {
    const from = dragFrom.current
    dragFrom.current = null
    if (from == null || from === toIdx) return
    const next = [...board]
    const [moved] = next.splice(from, 1)
    next.splice(toIdx, 0, moved)
    commit(next)
  }

  if (board === null) {
    return <div className="page-flat"><p className={s.info}>불러오는 중…</p></div>
  }

  // 권한 필터 — 보드엔 있지만 지금 권한이 없는 위젯은 그리지 않는다 (저장값은 보존)
  const visible = board
    .map((w, idx) => ({ ...w, idx, def: BOARD_WIDGETS[w.id] }))
    .filter((w) => w.def && canAccess(user, w.def.feature))

  const catalog = WIDGET_GROUPS.map((g) => ({
    group: g,
    items: Object.entries(BOARD_WIDGETS)
      .filter(([, d]) => d.group === g && canAccess(user, d.feature))
      .map(([id, d]) => ({ id, ...d, added: board.some((w) => w.id === id) })),
  })).filter((g) => g.items.length > 0)

  return (
    <div className={`page-flat ${s.wrap}`}>
      <div className={s.head}>
        <h1 className={s.title}>내 대시보드</h1>
        {editing && (
          <button type="button" className="btn-secondary btn-md" onClick={reset}>기본 구성</button>
        )}
        <button type="button"
          className={`btn-primary btn-md ${editing ? s.doneBtn : ''}`}
          onClick={() => {
            if (loadFailed) {
              toast('보드를 불러오지 못해 편집이 잠겼어요 — 새로고침 후 다시 시도해 주세요', 'error')
              return
            }
            setEditing((v) => !v)
            if (editing) toast('저장됨')
          }}>
          {editing ? '완료' : '편집'}
        </button>
      </div>

      {editing && (
        <p className={s.banner}>
          <b>편집 중</b> — 섹션을 끌어 순서를 바꾸고, ⅓ · ½ · 전폭 버튼으로 폭을 고르세요. 변경사항은 자동 저장됩니다.
        </p>
      )}

      {visible.length === 0 && !editing && (
        <p className={s.info}>
          보드가 비어 있어요 — <b>편집</b>을 눌러 화면을 담아보세요.
        </p>
      )}

      <div className={`${s.grid} ${editing ? s.gridEditing : ''}`}>
        {visible.map((w, vi) => (
          <section
            key={w.id}
            className={s.wg}
            style={{ gridColumn: `span ${SIZE_SPAN[w.size] || 3}` }}
            draggable={editing}
            onDragStart={() => { dragFrom.current = w.idx }}
            onDragOver={(e) => { if (editing) e.preventDefault() }}
            onDrop={(e) => { e.preventDefault(); onDrop(w.idx) }}
          >
            {editing && (
              <div className={s.tools}>
                <span className={s.grab} aria-hidden="true">⋮⋮</span>
                <button type="button" className={s.tool} disabled={vi === 0}
                  onClick={() => move(w.idx, -1)} title="앞으로">◀</button>
                <button type="button" className={s.tool} disabled={vi === visible.length - 1}
                  onClick={() => move(w.idx, 1)} title="뒤로">▶</button>
                <button type="button" className={`${s.tool} ${s.toolSize}`}
                  onClick={() => cycleSize(w.idx)} title="폭 변경">{SIZE_LABEL[w.size]}</button>
                <button type="button" className={`${s.tool} ${s.toolDel}`}
                  onClick={() => remove(w.idx)} title="보드에서 제거">✕</button>
              </div>
            )}
            <div className={s.embed} data-wid={w.id}>{w.def.render({ logout })}</div>
          </section>
        ))}

        {editing && (
          <button type="button" className={s.addTile} onClick={() => setSheetOpen(true)}>
            ＋ 화면 추가
          </button>
        )}
      </div>

      {sheetOpen && (
        <div className={s.backdrop} onClick={() => setSheetOpen(false)}>
          <div className={s.sheet} role="dialog" aria-label="화면 추가"
            onClick={(e) => e.stopPropagation()}>
            <div className={s.sheetHead}>
              <h2>화면 추가</h2>
              <p>권한이 있는 화면만 표시됩니다</p>
            </div>
            <div className={s.sheetBody}>
              {catalog.map(({ group, items }) => (
                <div key={group}>
                  <p className={s.catGrp}>{group}</p>
                  {items.map((it) => (
                    <div key={it.id} className={s.cat}>
                      <div className={s.catMain}>
                        <p className={s.catName}>{it.name}</p>
                        <p className={s.catDesc}>{it.desc}</p>
                      </div>
                      <button type="button" className={s.catAdd} disabled={it.added}
                        onClick={() => add(it.id)}>
                        {it.added ? '추가됨' : '추가'}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
