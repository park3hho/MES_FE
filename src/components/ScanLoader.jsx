// src/components/ScanLoader.jsx
// 작업 중 표시 — 서류 위를 스캔 선이 훑는다 (2026-09-17, 사용자 선택 B안)
//   ★ 라이브러리를 쓰지 않는다. CSS + 인라인 마크업뿐 — 구매 의뢰 9파일이 번들을 밀어올려
//     PWA 프리캐시 상한(2MiB)을 넘겨 Vercel 빌드가 깨진 적이 있다(error_log 2026-09-16).
//   ★ **문서를 읽는 작업에만** 쓴다. 목록·표를 불러오는 자리는 Skeleton 이 맞다 —
//     내용이 들어올 자리를 미리 보여주는 편이 낫다(components/Skeleton.jsx, 80곳 사용 중).
//   ★ '동작 줄이기'(prefers-reduced-motion)를 켠 기기에서는 선이 멈춘다 — CSS 에서 처리.
//
// 사용법:
//   <ScanLoader label="자료를 읽고 있어요" sub="보통 5초쯤 걸립니다" />   // 화면 중앙
//   <ScanLoader inline label="견적서를 읽는 중이에요" />                  // 한 줄 안
import s from './ScanLoader.module.css'

export default function ScanLoader({ label = '', sub = '', inline = false }) {
  return (
    // role=status — 화면 낭독기에는 글자로 알린다(그림은 aria-hidden)
    <div className={inline ? s.inline : s.wrap} role="status" aria-live="polite">
      <span className={`${s.doc} ${inline ? s.docSm : ''}`} aria-hidden="true">
        <span className={s.ln} />
        <span className={s.ln} />
        <span className={s.ln} />
        <span className={s.ln} />
        <span className={s.beam} />
      </span>
      {(label || sub) && (
        <span className={s.text}>
          {label && <b className={s.label}>{label}</b>}
          {sub && <span className={s.sub}>{sub}</span>}
        </span>
      )}
    </div>
  )
}
