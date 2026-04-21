// ══════════════════════════════════════════════════════════════
// InstallModal — PWA 앱 설치 다이얼로그
// ══════════════════════════════════════════════════════════════
// Android Chrome:  "설치" 버튼 → prompt() 호출
// iOS Safari:      공유 → 홈 화면에 추가 단계별 안내
// 기타 브라우저:   "PWA 미지원 안내"

import { usePWAInstall } from '@/hooks/usePWAInstall'
import s from './InstallModal.module.css'

export default function InstallModal({
  onClose,    // function(): 모달 닫기
}) {
  const { installed, isIOS, hasAndroidPrompt, promptInstall } = usePWAInstall()

  const handleAndroidInstall = async () => {
    const outcome = await promptInstall()
    if (outcome === 'accepted') onClose()
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <span className={s.title}>📲 앱 설치</span>
          <button className={s.closeBtn} onClick={onClose} aria-label="닫기">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* 이미 설치된 경우 */}
        {installed && (
          <div className={s.body}>
            <p className={s.installedMsg}>✅ 이미 앱으로 실행 중입니다.</p>
          </div>
        )}

        {/* Android Chrome: 자동 설치 가능 */}
        {!installed && hasAndroidPrompt && (
          <div className={s.body}>
            <p className={s.desc}>
              홈 화면에 MES를 추가하면 앱처럼 전체화면으로 사용할 수 있습니다.
            </p>
            <button className="btn-primary btn-full" onClick={handleAndroidInstall}>
              앱 설치하기
            </button>
          </div>
        )}

        {/* iOS Safari: 수동 안내 */}
        {!installed && isIOS && (
          <div className={s.body}>
            <p className={s.desc}>
              아이폰에서 앱처럼 사용하려면 Safari의 <strong>공유 메뉴</strong>를 통해 홈 화면에 추가하세요.
            </p>
            <ol className={s.steps}>
              <li>
                하단 중앙의 <strong>공유 버튼</strong> 탭
                <div className={s.icon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                </div>
              </li>
              <li>
                목록에서 <strong>"홈 화면에 추가"</strong> 선택
              </li>
              <li>
                오른쪽 상단 <strong>"추가"</strong> 탭
              </li>
            </ol>
            <p className={s.note}>
              ⚠️ Chrome·Firefox 등 다른 브라우저에서는 설치할 수 없습니다. 반드시 <strong>Safari</strong>로 접속하세요.
            </p>
          </div>
        )}

        {/* Android이지만 조건 미달 or 기타 브라우저 */}
        {!installed && !hasAndroidPrompt && !isIOS && (
          <div className={s.body}>
            <p className={s.desc}>
              현재 브라우저에서는 자동 설치 버튼을 지원하지 않습니다.
            </p>
            <p className={s.note}>
              브라우저 메뉴(⋮)에서 <strong>"홈 화면에 추가"</strong> 또는 <strong>"앱 설치"</strong>를 선택하세요.
              <br/>
              <br/>
              💡 Android: Chrome 사용 권장
              <br/>
              💡 iOS: Safari 사용 필수
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
