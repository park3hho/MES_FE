// hooks/useModalA11y.js
// 모달 접근성 훅 — 포커스 트랩 + ESC 닫기 + 마운트 시 첫 요소 포커스 + 포커스 복원
// 호출: ConfirmDialog, InstallModal 등 오버레이 모달

import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useModalA11y(active, onClose) {
  const ref = useRef(null)

  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return

    const prevFocus = document.activeElement
    const getFocusable = () =>
      [...node.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)

    // 마운트 시 첫 포커스 가능한 요소로 이동 (없으면 컨테이너 자체)
    const initial = getFocusable()
    ;(initial[0] || node).focus()

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const f = getFocusable()
      if (f.length === 0) {
        e.preventDefault()
        return
      }
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus()
    }
  }, [active, onClose])

  return ref
}
