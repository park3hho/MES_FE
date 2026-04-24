// src/pages/home/HomePage.jsx
// 홈 탭 — 릴리스 노트 / 뉴스레터 / 공지 등을 표시할 공간 (2026-04-24 신규)
// 현재는 placeholder — 추후 컨텐츠 연결

import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import s from './HomePage.module.css'

export default function HomePage({ user }) {
  const name = user?.id || '작업자'

  return (
    <div className="page-flat">
      <PageHeader
        title={`${name}님, 안녕하세요 👋`}
        subtitle="오늘의 소식과 업데이트를 모아 보여드릴게요"
      />

      <Section label="공지">
        <div className={s.placeholder}>
          <div className={s.placeholderIcon} aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l18-8-8 18-2-8z" />
            </svg>
          </div>
          <p className={s.placeholderTitle}>곧 업데이트 소식을 전해드릴게요</p>
          <p className={s.placeholderDesc}>
            새로운 기능, 알아두면 좋을 변경점, 작업 안내를
            <br />이 곳에서 한눈에 확인하실 수 있게 준비 중이에요.
          </p>
        </div>
      </Section>

      <Section label="릴리스 노트">
        <div className={s.empty}>아직 표시할 노트가 없어요</div>
      </Section>

      <Section label="뉴스레터">
        <div className={s.empty}>발행 예정이에요</div>
      </Section>
    </div>
  )
}
