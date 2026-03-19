import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FaradayLogo } from '@/components/FaradayLogo'

// 로그인 후 잠깐 보여주는 스플래시 화면
// duration: 표시 시간 (ms), onDone: 완료 콜백
export default function SplashScreen({ visible, onDone, duration = 1800, userName = null }) {
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(onDone, duration)
    return () => clearTimeout(t)
  }, [visible])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed', inset: 0,
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            gap: 24,
          }}
        >
          {/* 로고 — 아래서 올라오며 등장 */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <FaradayLogo size="lg" />
          </motion.div>

          {/* 환영 문구 */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ textAlign: 'center' }}
          >
            <p style={{ fontSize: 15, color: '#8a93a8', fontWeight: 500, margin: 0 }}>
              {userName ? `${userName}님, 환영합니다` : '환영합니다'}
            </p>
          </motion.div>

          {/* 하단 로딩 점 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            style={{ display: 'flex', gap: 6, position: 'absolute', bottom: 48 }}
          >
            {[0, 1, 2].map(i => (
              <motion.span
                key={i}
                animate={{ opacity: [0.2, 0.8, 0.2] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
                style={{ width: 5, height: 5, borderRadius: '50%', background: '#c8cdd8', display: 'block' }}
              />
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}