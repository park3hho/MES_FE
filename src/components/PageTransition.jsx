import { useRef, useState, useEffect } from 'react'
import './PageTransition.css'

// direction: 'forward' | 'back'
export default function PageTransition({ children, pageKey, direction = 'forward' }) {
  const [displayChildren, setDisplayChildren] = useState(children)
  const [phase, setPhase] = useState('idle') // 'idle' | 'exit' | 'enter'
  const prevKeyRef = useRef(pageKey)
  const timerRef = useRef(null)

  useEffect(() => {
    if (prevKeyRef.current === pageKey) return

    prevKeyRef.current = pageKey

    // 1. 현재 페이지 exit
    setPhase('exit')
    timerRef.current = setTimeout(() => {
      // 2. 새 페이지로 교체
      setDisplayChildren(children)
      setPhase('enter')
      timerRef.current = setTimeout(() => {
        setPhase('idle')
      }, 300)
    }, 200)

    return () => clearTimeout(timerRef.current)
  }, [pageKey])

  // children이 바뀌었을 때 idle 상태면 바로 반영
  useEffect(() => {
    if (phase === 'idle') setDisplayChildren(children)
  }, [children])

  const cls = phase === 'exit'
    ? (direction === 'back' ? 'page-exit-back' : 'page-exit')
    : phase === 'enter'
    ? (direction === 'back' ? 'page-enter-back' : 'page-enter')
    : ''

  return (
    <div className={`page-transition-wrap ${cls}`}>
      {displayChildren}
    </div>
  )
}