// src/pages/home/HomePage.jsx
// 홈 탭 — 릴리스 노트 / 뉴스레터 / 공지 등을 표시할 공간 (2026-04-24 신규)
// 빠른 진입 섹션 제거 (2026-05-26) — BOM 조회는 AdminPage(미배포 기능) 로 이전.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { getReleaseNotes } from '@/api'
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import { canAccess, Feature } from '@/constants/permissions'
import { fmtKstDate } from '@/utils/dateConvert'
import s from './HomePage.module.css'

export default function HomePage({ user }) {
  const name = user?.id || '작업자'
  const navigate = useNavigate()
  // 릴리스 노트 = 배포 문서(/release-note)의 발행분. ★ 여기서 따로 만들지 않는다 —
  //   같은 개념을 두 화면이 각자 들고 있으면 한쪽이 영원히 '없음' 이라고 단언하게 된다.
  const canSeeRelease = canAccess(user, Feature.RELEASE_VIEW)
  const [notes, setNotes] = useState(null)

  useEffect(() => {
    if (!canSeeRelease) return undefined
    let alive = true
    getReleaseNotes()
      .then((r) => { if (alive) setNotes((r.items || []).slice(0, 3)) })
      .catch(() => { if (alive) setNotes([]) })   // 실패해도 홈은 떠야 한다
    return () => { alive = false }
  }, [canSeeRelease])

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

      {/* 권한 없는 사용자에겐 섹션 자체를 숨긴다 — 갈 수 없는 곳을 보여주지 않는다 */}
      {canSeeRelease && (
        <Section label="릴리스 노트">
          {notes === null ? (
            <div className={s.empty}>불러오는 중…</div>
          ) : notes.length === 0 ? (
            <div className={s.empty}>아직 발행된 배포 문서가 없어요</div>
          ) : (
            <div className={s.relList}>
              {notes.map((n) => (
                <button key={n.id} type="button" className={s.relItem}
                  onClick={() => navigate('/release-note')}>
                  <span className={s.relVer}>{n.version}</span>
                  <span className={s.relTitle}>{n.title}</span>
                  <span className={s.relWhen}>{fmtKstDate(n.released_at)}</span>
                </button>
              ))}
              <button type="button" className={s.relMore}
                onClick={() => navigate('/release-note')}>전체 배포 문서 보기 →</button>
            </div>
          )}
        </Section>
      )}

      <Section label="뉴스레터">
        <div className={s.empty}>발행 예정이에요</div>
      </Section>
    </div>
  )
}
