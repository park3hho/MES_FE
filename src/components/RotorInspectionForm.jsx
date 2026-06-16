// src/components/RotorInspectionForm.jsx
// ★ 회전자(RT) OQ 검사 입력 폼 — 내경/외경 지그 OK·NG (2026-06-16)
// 호출: RotorOQPage.jsx → step='inspect'
// 고정자 InspectionForm 의 단순 대칭: 측정값(R/L/K_T) 없이 지그 2항목만.
//   판정 미리보기는 표시용 — 최종 판정은 BE(rotor_oq_inspection_service._compute_judgment).
//   스타일은 InspectionForm.module.css 재사용 (Test1Section 토글 패턴 동일).
import { useState } from 'react'
import PageHeader from './common/PageHeader'
import { JUDGMENT, JUDGMENT_COLORS as JUDGMENT_COLOR_MAP } from '@/constants/etcConst'
import s from './InspectionForm.module.css'

const cx = (...c) => c.filter(Boolean).join(' ')

export default function RotorInspectionForm({
  phi,
  motorType,
  lotOqNo,
  lotBoNo,           // BO(본딩) LOT — subtitle 표시 + 검사 대상
  initialData = null,
  onSubmit,
  onCancel,
}) {
  const d = initialData || {}
  const norm = (v) => (v && v !== '-' ? v : '')
  const [inner, setInner] = useState(norm(d.inner_jig))
  const [outer, setOuter] = useState(norm(d.outer_jig))
  const [remark, setRemark] = useState(d.remark || '')
  const [pending, setPending] = useState(null)   // 확인 다이얼로그 payload

  const btnClass = (active, isRed = false) =>
    cx(s.btn, active && (isRed ? s.btnActiveRed : s.btnActive))

  // 판정 미리보기 — 내경·외경 모두 OK → OK, 하나라도 NG → FAIL, 미입력 → PENDING (BE 규칙과 동기)
  const judgment =
    (!inner || !outer) ? JUDGMENT.PENDING
      : (inner === 'NG' || outer === 'NG') ? JUDGMENT.FAIL
        : JUDGMENT.OK

  const buildPayload = () => ({
    phi,
    motor_type: motorType || '',
    inner_jig: inner || '-',
    outer_jig: outer || '-',
    judgment,
    remark: remark.trim(),
  })

  const subtitleParts = [`Φ${phi}`, motorType || null, lotBoNo || null, lotOqNo || null].filter(Boolean)

  return (
    <div className={`page-flat ${s.pageFlat}`}>
      <PageHeader title="회전자 OQ 검사" subtitle={subtitleParts.join(' · ')} onBack={onCancel} />

      {/* 내경 지그 */}
      <div className={s.section}>
        <span className={s.label}>내경 지그</span>
        <div className={s.row}>
          <button className={btnClass(inner === 'OK')} onClick={() => setInner('OK')}>OK</button>
          <button className={btnClass(inner === 'NG', true)} onClick={() => setInner('NG')}>NG</button>
        </div>
      </div>

      {/* 외경 지그 */}
      <div className={s.section}>
        <span className={s.label}>외경 지그</span>
        <div className={s.row}>
          <button className={btnClass(outer === 'OK')} onClick={() => setOuter('OK')}>OK</button>
          <button className={btnClass(outer === 'NG', true)} onClick={() => setOuter('NG')}>NG</button>
        </div>
      </div>

      {/* 비고 (선택) */}
      <div className={s.remarkBox}>
        <label className={s.remarkLabel}>비고 (선택)</label>
        <textarea
          className={s.remarkInput}
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="특이사항이 있으면 입력 (최대 200자)"
          maxLength={200}
          rows={2}
        />
      </div>

      {/* 하단 sticky 저장 CTA */}
      <div className="sticky-cta">
        <div className="sticky-cta-inner">
          <button className={s.submit} onClick={() => setPending(buildPayload())}>
            저장
          </button>
        </div>
      </div>

      {/* 저장 확인 다이얼로그 — 판정은 BE 가 단독 산출, 여기선 예상 판정만 표시 */}
      {pending && (() => {
        const j = pending.judgment
        const descMap = {
          [JUDGMENT.OK]:      '합격 예상 — 서버 판정이 OK 면 RT 번호 발급 + 라벨이 출력됩니다.',
          [JUDGMENT.PENDING]: '미완료 — 내경/외경을 모두 입력해 주세요. 임시 저장됩니다.',
          [JUDGMENT.FAIL]:    '불합격 예상 — 이 회전자는 출하 대상에서 제외됩니다.',
        }
        return (
          <div
            className={s.confirmOverlay}
            onPointerDown={(e) => { if (e.target === e.currentTarget) setPending(null) }}
          >
            <div className={s.confirmDialog} onPointerDown={(e) => e.stopPropagation()}>
              <p className={s.confirmTitle}>이 내용으로 저장할까요?</p>
              <p className={s.confirmSub}>
                예상 판정: <b style={{ color: JUDGMENT_COLOR_MAP[j] }}>{j}</b>
              </p>
              <p className={s.confirmDesc}>{descMap[j]}</p>
              <p className={s.confirmDesc}>※ 최종 판정은 서버가 결정합니다.</p>
              <div className={s.confirmBtnRow}>
                <button
                  type="button"
                  className={s.confirmCancel}
                  onPointerDown={(e) => { e.preventDefault(); setPending(null) }}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={s.confirmOk}
                  onPointerDown={(e) => { e.preventDefault(); onSubmit(pending); setPending(null) }}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
