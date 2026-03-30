// hooks/useAutoReset.js
// 에러/성공 상태 자동 리셋 훅
// 호출: 모든 공정 페이지 (RMPage ~ OBPage)

import { useEffect } from 'react'
import { RESET_ERROR_DELAY, RESET_SUCCESS_DELAY } from '@/constants/etcConst'

export function useAutoReset(error, done, onReset) {
  useEffect(() => {
    if (!error) return
    const t = setTimeout(onReset, RESET_ERROR_DELAY)
    return () => clearTimeout(t)
  }, [error])

  useEffect(() => {
    if (!done) return
    const t = setTimeout(onReset, RESET_SUCCESS_DELAY)
    return () => clearTimeout(t)
  }, [done])
}
