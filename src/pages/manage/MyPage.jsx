// src/pages/manage/MyPage.jsx
// 마이페이지 — 추후 요소 추가 예정 (현재는 스텁)

import { FaradayLogo } from '@/components/FaradayLogo'
import s from './MyPage.module.css'

export default function MyPage({ user, onLogout }) {
  return (
    <div className="page">
      <div className={`card ${s.card}`}>
        <FaradayLogo size="sm" />

        <div className={s.avatar}>👤</div>
        <h2 className={s.name}>{user?.id || '사용자'}</h2>
        <p className={s.loginId}>{user?.login_id || '-'}</p>

        <div className={s.placeholder}>
          마이페이지 — 요소 추가 예정
        </div>

        <button className="btn-ghost btn-sm" onClick={onLogout}>
          로그아웃
        </button>
      </div>
    </div>
  )
}
