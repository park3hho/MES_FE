// hooks/useViewHistorySync.js
// view.mode 와 브라우저 history stack 을 단방향 동기화하는 훅 (2026-05-21).
//
// 사용처: BomManagePage, ItemManagePage 등 list ↔ 비-list 모드를 가진 manage 페이지.
// useSearchParams 양방향 sync 가 일으키던 race 와 pushState/back 비대칭 stack 누수를
// 동시에 차단한 패턴을 훅으로 추출.
//
// 규칙:
//   · list → 비-list 진입       : pushState 한 번 (back 키 받을 자리)
//   · 비-list → list (UI 닫기) : history.back() 으로 stack 도 같이 비움
//   · popstate (브라우저 back)  : 무조건 view=list 로 리셋
//
// prevModeRef 트릭: popstate 핸들러에서 ref 를 미리 'list' 로 만들어,
// 직후 효과가 `prev !== 'list' && view==='list'` 분기에 빠져
// history.back() 을 또 부르는 무한루프를 차단.
//
// 사용 예:
//   const [view, setView] = useState({ mode: 'list' })
//   useViewHistorySync(view.mode, setView, 'bom-modal')

import { useEffect, useRef } from 'react'

export function useViewHistorySync(viewMode, setView, modalKey) {
  const prevModeRef = useRef('list')
  useEffect(() => {
    const onPop = () => {
      prevModeRef.current = 'list'
      setView({ mode: 'list' })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [setView])
  useEffect(() => {
    const prev = prevModeRef.current
    prevModeRef.current = viewMode
    if (prev === 'list' && viewMode !== 'list') {
      window.history.pushState({ k: modalKey }, '')
    } else if (prev !== 'list' && viewMode === 'list') {
      window.history.back()
    }
  }, [viewMode, modalKey])
}
