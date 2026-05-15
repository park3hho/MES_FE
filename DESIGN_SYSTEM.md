# Toss-Flat Design System (Portable Edition)

> 다른 프로젝트로 그대로 이식해서 쓸 수 있게 정리한 디자인 시스템 + 디자인 방향성 문서.
> FD MES 프로젝트에서 사용 중인 시스템을 일반화한 버전입니다.
>
> 이 문서는 "왜 이렇게 하는가 (philosophy)" → "정확히 어떤 값 (tokens)" → "어떻게 쓰는가 (patterns)" → "쓰지 말 것 (anti-patterns)" 순서로 구성됩니다.

---

## 목차

- [1. 철학 (Philosophy)](#1-철학)
- [2. 7대 원칙](#2-7대-원칙)
- [3. 디자인 토큰 (variables.css 완본)](#3-디자인-토큰)
- [4. 레이아웃 시스템](#4-레이아웃-시스템)
- [5. 핵심 컴포넌트 패턴](#5-핵심-컴포넌트-패턴)
- [6. 버튼 시스템](#6-버튼-시스템)
- [7. 폼 / 입력](#7-폼--입력)
- [8. 모달 / 오버레이](#8-모달--오버레이)
- [9. 애니메이션 규칙](#9-애니메이션-규칙)
- [10. 안티 패턴 (금지 사항)](#10-안티-패턴)
- [11. 디렉토리 / 파일 네이밍](#11-디렉토리--네이밍)
- [12. 새 프로젝트 시작 가이드](#12-새-프로젝트-시작-가이드)
- [13. 마이그레이션 체크리스트 (레거시 → flat)](#13-마이그레이션-체크리스트)

---

## 1. 철학

**한 줄 요약**: 카드 중첩 없는 풀와이드 flat 레이아웃 + 대화형 카피 + 8px 그리드 + 즉각적 피드백.

이 시스템은 **토스 (Toss) 의 UI 컨벤션**을 기반으로 합니다. 핵심 신념:

| 신념 | 의미 |
|---|---|
| **인지 부담 최소화** | 한 화면에 한 가지 결정만 (Progressive Disclosure). 카드 안에 카드 안에 카드 식으로 위계가 쌓이지 않게. |
| **대화처럼 말하기** | 사용자에게 "입력하세요" 라고 명령하지 말고 "어떤 걸로 할까요?" 라고 물어보기. |
| **모든 픽셀에 의미** | 임의의 16px, 14px 가 아니라 토큰에 정의된 값만 사용. 8 배수 그리드. |
| **터치 우선** | 모든 클릭 가능 요소는 최소 44×44px (Fitts's Law + Apple HIG / Material). |
| **시각적 노이즈 제거** | 그림자, 둥근 모서리, 카드 보더는 최소한. 구분은 "거의 안 보이는 얇은 선" 으로. |
| **즉시 피드백** | 탭하면 ripple, 완료되면 1.2초 안에 자동 리셋, 로딩 시 스켈레톤. |

---

## 2. 7대 원칙

매 화면 설계 시 체크리스트로 쓰기.

### 1) 1 스크린 = 1 질문 (Progressive Disclosure)
한 화면은 한 가지 결정만 묻는다. 폼 7개를 한꺼번에 펼치지 말고 단계로 나눈다.

```
❌ 한 화면에 다 입력
[업체] [재료] [두께] [수량] [날짜] [확인]

✅ 단계별 진행
화면 1: "어떤 업체인가요?" → [A] [B] [C]
화면 2: "재료는요?" → [X] [Y]
화면 3: "두께는요?" → [입력]
```

### 2) 대화형 카피 (Conversational Copy)
명령형 → 질문형. 사용자가 답변하는 느낌.

```
❌ "수량을 입력하세요"      → ✅ "몇 개 만들까요?"
❌ "확인"                  → ✅ "이대로 진행할게요"
❌ "에러: 입력값 없음"       → ✅ "한 가지만 더 알려주세요"
```

### 3) Flat 레이아웃 (카드 중첩 금지)
페이지는 풀와이드 흰 배경 한 장. 안에 카드 안에 카드 박지 않는다.

```
❌ 카드 중첩
<div class="page">
  <div class="card">
    <div class="card">         /* 그림자 + 그림자 + 그림자 */
      <Content />
    </div>
  </div>
</div>

✅ Flat
<div class="page-flat">
  <PageHeader title="..." />
  <Section label="...">
    <ListItem ... />            /* 얇은 구분선만 */
    <ListItem ... />
  </Section>
</div>
```

구분이 필요하면 `border-bottom: 1px solid var(--color-list-divider)` 하나만.

### 4) 큰 터치 영역 (Touch Target ≥ 44px)
모든 버튼/리스트 row 는 최소 44px 높이. 모바일에서 손가락이 닿아야 함.

```css
--touch-target: 44px;

.btn-primary { min-height: var(--touch-target); }
.list-item { min-height: 56px; }       /* 리스트 row 는 좀 더 여유 */
```

### 5) 즉각적 피드백
- 탭하면 → `background: var(--color-ripple)` + `transform: scale(0.98)` 즉시
- API 호출 중 → 스피너 또는 스켈레톤 (빈 화면 금지)
- 성공 → 체크 애니메이션 0.3s → 1.2s 뒤 자동 리셋
- 에러 → 메시지 띄우고 1.5s 뒤 자동 복구

### 6) 8px 그리드 여백
모든 padding/margin/gap 은 `var(--space-*)` 로만. 직접 px 값 금지.

```css
--space-xs:  4px;
--space-sm:  8px;
--space-md:  12px;
--space-lg:  16px;
--space-xl:  24px;
--space-2xl: 32px;
```

### 7) 명암비 높은 텍스트
- 본문: `var(--color-dark)` (#1a2540)
- 보조: `var(--color-text-sub)` (#5f6b7a) — WCAG AA 통과
- 비활성: `var(--color-gray-light)` (#adb4c2) — 보조보다 더 옅게

회색끼리 단계별로 구분되어야 위계가 살아남.

---

## 3. 디자인 토큰

**전체 토큰 파일** (`styles/variables.css`) — 그대로 복사해서 새 프로젝트에 붙여넣기. 색상만 브랜드에 맞게 바꾸면 됨.

```css
/* ═══════════════════════════════════════════
   색상 (Colors)
═══════════════════════════════════════════ */
:root {
  /* 브랜드 (프로젝트마다 바꿀 것) */
  --color-primary:     #1a2f6e;   /* 메인 강조 — 버튼, 액티브 */
  --color-brand:       #1F2677;
  --color-orange:      #F99535;   /* 보조 브랜드 — 포인트 */

  /* 텍스트 위계 (3단계) */
  --color-dark:        #1a2540;   /* 본문 */
  --color-gray:        #8a93a8;   /* 보조 (레거시 — text-sub 로 점진 교체) */
  --color-text-sub:    #5f6b7a;   /* 보조 (개선판 — 명암비 ↑) */
  --color-gray-light:  #adb4c2;   /* 비활성 */

  /* 보더 / 배경 */
  --color-border:        #e0e4ef;
  --color-border-dark:   #d8dce8;
  --color-list-divider:  #f0f2f6;  /* 거의 안 보이는 얇은 구분선 */
  --color-ripple:        #eef1f8;  /* 탭 피드백 */
  --color-bg:            #f4f6fb;  /* 페이지 배경 (레거시) */
  --color-bg-input:      #fafbfd;
  --color-white:         #ffffff;
  --color-surface:       #ffffff;  /* 카드/모달 배경 */
  --color-page-flat:     #ffffff;  /* flat 페이지 배경 */

  /* 상태 */
  --color-error:        #c0392b;
  --color-success:      #27ae60;
  --color-success-bg:   #eafaf1;
  --color-info:         #1565c0;
  --color-info-bg:      #e3f2fd;
  --color-warn:         #e67e22;

  /* 도메인 색상 (예시 — 프로젝트에 맞게 추가) */
  --color-judgment-ok:      #1a9e75;
  --color-judgment-fail:    #c0392b;
  --color-judgment-recheck: #2e86c1;
  --color-judgment-probe:   #8e44ad;
  --color-judgment-pending: #e67e22;

  /* 차트 팔레트 */
  --chart-grid:    #d0d6e4;
  --chart-tick:    #64748b;
  --chart-blue:    #2563eb;
  --chart-emerald: #059669;
  --chart-pink:    #db2777;
  --chart-amber:   #f59e0b;
  --chart-red:     #ef4444;
  --chart-violet:  #8b5cf6;
}

/* ═══════════════════════════════════════════
   Border Radius
═══════════════════════════════════════════ */
:root {
  --radius-xs:   4px;
  --radius-sm:   6px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   14px;
  --radius-full: 999px;
}

/* ═══════════════════════════════════════════
   Shadow (최소한만)
═══════════════════════════════════════════ */
:root {
  --shadow-card:  0 4px 24px rgba(26, 47, 110, 0.09);
  --shadow-modal: 0 20px 60px rgba(26, 47, 110, 0.22);
}

/* ═══════════════════════════════════════════
   Typography
═══════════════════════════════════════════ */
:root {
  --font-base: 'Noto Sans KR', sans-serif;   /* 한국어 / Inter 등으로 교체 */

  --text-xs:   10px;
  --text-sm:   11px;
  --text-base: 13px;
  --text-md:   14px;
  --text-lg:   16px;
  --text-xl:   18px;
  --text-2xl:  20px;

  --font-normal: 400;
  --font-medium: 500;
  --font-bold:   600;
  --font-bolder: 700;
}

/* ═══════════════════════════════════════════
   Spacing (8px 그리드)
═══════════════════════════════════════════ */
:root {
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  12px;
  --space-lg:  16px;
  --space-xl:  24px;
  --space-2xl: 32px;
}

/* ═══════════════════════════════════════════
   Breakpoints (참조용 — JS 와 동기)
   ※ @media 쿼리에서는 var() 사용 불가 → 리터럴로
═══════════════════════════════════════════ */
:root {
  --bp-mini:    360px;
  --bp-mobile:  480px;
  --bp-tablet:  768px;
  --bp-laptop:  1024px;
  --bp-desktop: 1200px;
}

/* ═══════════════════════════════════════════
   Touch Target (Apple HIG / Material 기준)
═══════════════════════════════════════════ */
:root {
  --touch-target: 44px;
}

/* ═══════════════════════════════════════════
   Easing & Motion
═══════════════════════════════════════════ */
:root {
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);  /* 살짝 튕기는 스프링 */
  --ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);     /* 부드러운 감속 (기본) */
  --ease-out:    cubic-bezier(0.0, 0.0, 0.2, 1);     /* 빠르게 시작, 느리게 끝 */

  --duration-fast:   150ms;   /* 버튼 피드백, ripple */
  --duration-normal: 250ms;   /* 페이지/모달 전환 */
  --duration-slow:   400ms;   /* 복합 시퀀스 */
}

/* ═══════════════════════════════════════════
   Skeleton (로딩 상태)
═══════════════════════════════════════════ */
:root {
  --skeleton-bg:       #e0e4ef;
  --skeleton-shimmer:  #f0f2f6;
  --skeleton-duration: 1.5s;
}
```

### 토큰 명명 규칙

| Prefix | 의미 | 예시 |
|---|---|---|
| `--color-*` | 색상 | `--color-primary` |
| `--text-*` | font-size | `--text-base` |
| `--font-*` | font-weight / family | `--font-bold` |
| `--space-*` | spacing (gap, padding, margin) | `--space-md` |
| `--radius-*` | border-radius | `--radius-lg` |
| `--shadow-*` | box-shadow | `--shadow-card` |
| `--ease-*` | timing function | `--ease-smooth` |
| `--duration-*` | transition duration | `--duration-normal` |
| `--bp-*` | breakpoint (참조용) | `--bp-mobile` |

**규칙**: 컴포넌트 CSS 에서 직접 `#xxxxxx`, `16px`, `cubic-bezier(...)` 쓰지 말 것. 새 값 필요하면 토큰부터 추가.

---

## 4. 레이아웃 시스템

### 4.1 페이지 컨테이너

```css
/* 풀와이드 flat — 기본 페이지 (권장) */
.page-flat {
  min-height: 100vh;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-xl) var(--space-lg);
  padding-bottom: calc(var(--space-xl) + var(--bottom-nav-height, 0px));
  background: var(--color-page-flat);
  box-sizing: border-box;
}

/* QR 스캐너 같은 다크 풀스크린 */
.page-scan {
  min-height: 100vh;
  width: 100%;
  background: #1a2540;  /* dark */
  color: #fff;
}

/* 레거시 — 점진적으로 제거 */
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl);
  background: var(--color-bg);
}
.card {
  width: 100%;
  max-width: 480px;
  padding: 28px 32px 24px;
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
}
```

### 4.2 페이지 헤더 (질문형 + 우상단 뒤로가기)

```css
.page-header {
  margin-bottom: var(--space-2xl);
}
.page-title {
  font-size: 24px;
  font-weight: var(--font-bolder);
  color: var(--color-dark);
  letter-spacing: -0.02em;
  margin: 0;
}
.page-subtitle {
  font-size: var(--text-md);
  color: var(--color-text-sub);
  margin-top: var(--space-xs);
}
```

**규약**:
- 뒤로가기 버튼은 **항상 우상단** (왼쪽 X)
- 페이지 진입 시 `window.scrollTo(0, 0)` 강제 — 새 페이지는 항상 최상단부터

### 4.3 Section + List

```css
.section {
  margin-bottom: var(--space-2xl);
}
.section-label {
  font-size: var(--text-sm);
  font-weight: var(--font-bolder);
  color: var(--color-text-sub);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 var(--space-sm);
}

/* Toss 핵심 패턴 — 카드 대신 row + 얇은 구분선 */
.list-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  min-height: 56px;
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-list-divider);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-smooth);
}
.list-item:last-child { border-bottom: none; }
.list-item:hover { background: var(--color-ripple); }
.list-item:active { transform: scale(0.98); }
```

### 4.4 Sticky CTA (하단 고정 액션)

```css
.sticky-cta {
  position: sticky;
  bottom: 0;
  margin: 0 calc(-1 * var(--space-lg));
  padding: var(--space-md) var(--space-lg) calc(var(--space-md) + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--color-page-flat) 60%, transparent);
  z-index: 10;
}
```

폼 마지막 "다음" / "저장" 버튼이 항상 화면 하단에 보이도록.

---

## 5. 핵심 컴포넌트 패턴

### 5.1 PageHeader

```jsx
// components/common/PageHeader.jsx
import { useEffect } from 'react'

export default function PageHeader({ title, subtitle, onBack, action }) {
  // 페이지 진입 시 무조건 스크롤 최상단 — 규약
  useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
  }, [])

  const rightNode = action ?? (onBack ? (
    <button
      type="button"
      onClick={onBack}
      aria-label="뒤로"
      style={{
        background: 'transparent', border: 'none',
        fontSize: 22, color: 'var(--color-dark)',
        padding: '4px 8px', cursor: 'pointer', lineHeight: 1,
      }}
    >←</button>
  ) : null)

  return (
    <header className="page-header">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {rightNode && <div style={{ flexShrink: 0 }}>{rightNode}</div>}
      </div>
    </header>
  )
}
```

**사용**:
```jsx
<PageHeader
  title="어떤 공정으로 갈까요?"      // 질문형
  subtitle="목록에서 선택해주세요"
  onBack={() => navigate(-1)}
/>
```

### 5.2 Section

```jsx
// components/common/Section.jsx
export default function Section({ label, children }) {
  return (
    <section className="section">
      {label && <p className="section-label">{label}</p>}
      {children}
    </section>
  )
}
```

### 5.3 ListItem

```jsx
// components/common/ListItem.jsx
export default function ListItem({
  leftKey,        // 좌측 배지 ("RM", "MP", "PRINT" — 2자 vs 3자+ 자동 사이징)
  title,
  sub,
  right,          // 우측 슬롯 (배지, 카운트 등)
  onClick,
  disabled,
  hideChevron,
}) {
  const isShort = (leftKey?.length ?? 0) <= 2
  return (
    <div
      className={`list-item ${disabled ? 'list-item--disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      {leftKey && (
        <span className={`list-item-key ${isShort ? 'list-item-key--short' : ''}`}>
          {leftKey}
        </span>
      )}
      <div className="list-item-main">
        <div className="list-item-title">{title}</div>
        {sub && <div className="list-item-sub">{sub}</div>}
      </div>
      {right && <div className="list-item-right">{right}</div>}
      {!hideChevron && <span className="list-item-chevron">›</span>}
    </div>
  )
}
```

`list-item-key--short` 는 2자 이하일 때 더 큰 폰트(`font-size: 16px`, `min-width: 44px`) 로 무게감 살림.

---

## 6. 버튼 시스템

**Variant × Size 2축 매트릭스**.

### CSS

```css
/* ─ Variant (외형) ─ */
.btn-primary {
  background: var(--color-primary);
  color: #fff;
  border: none;
}
.btn-primary:hover { background: var(--color-primary-dark, #14275a); }

.btn-secondary {
  background: #fff;
  color: var(--color-primary);
  border: 1.5px solid var(--color-primary);
}
.btn-secondary:hover { background: var(--color-ripple); }

.btn-ghost {
  background: transparent;
  color: var(--color-text-sub);
  border: 1px solid var(--color-border);
}

.btn-text {
  background: none;
  border: none;
  color: var(--color-primary);
  text-decoration: underline;
  padding: 4px 0;
  min-height: 0;
}

.btn-danger {
  background: var(--color-error);
  color: #fff;
  border: none;
}

/* ─ 공통 — 모든 variant 적용 ─ */
[class*="btn-"] {
  font-weight: var(--font-bold);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-smooth),
              transform var(--duration-fast) var(--ease-smooth);
  min-height: var(--touch-target);
  padding: 12px 20px;
  font-size: var(--text-md);
}
[class*="btn-"]:active { transform: scale(0.97); }
[class*="btn-"]:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

/* ─ Size (별도 크기) ─ */
.btn-sm { padding: 7px 14px;  font-size: var(--text-sm);   min-height: var(--touch-target); }
.btn-md { padding: 10px 16px; font-size: var(--text-base); min-height: var(--touch-target); }
.btn-lg { padding: 14px 20px; font-size: var(--text-md);   min-height: var(--touch-target); }

/* ─ Modifier ─ */
.btn-full { width: 100%; }
```

### 사용

```jsx
<button className="btn-primary btn-lg btn-full">확인</button>
<button className="btn-secondary btn-md">취소</button>
<button className="btn-ghost btn-sm">로그아웃</button>
<button className="btn-text">이전으로</button>
<button className="btn-danger btn-lg btn-full">폐기 확인</button>
```

**규칙**:
- 인라인 `style={{ width: '100%' }}` 금지 → `btn-full` 사용
- 인라인 `style={{ padding: ... }}` 금지 → size 클래스 사용
- 새 색상 variant 필요해도 `style={{ background: '#...' }}` 금지 → CSS 에 추가

---

## 7. 폼 / 입력

```css
.form-group { margin-bottom: var(--space-lg); }
.form-label {
  display: block;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-sub);
  margin-bottom: var(--space-xs);
}
.form-input {
  width: 100%;
  padding: 10px 12px;
  font-size: var(--text-md);
  font-family: var(--font-base);
  color: var(--color-dark);
  background: var(--color-bg-input);
  border: 1px solid var(--color-border-dark);
  border-radius: var(--radius-md);
  outline: none;
  box-sizing: border-box;
  transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
}
.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(26, 47, 110, 0.08);
}
.form-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.form-row {
  display: flex;
  gap: var(--space-sm);
}
.form-error {
  margin-top: var(--space-sm);
  font-size: var(--text-sm);
  color: var(--color-error);
}
```

**날짜/시간 입력**: 텍스트 박스 대신 `type="date"`, `type="time"` 사용. 사용자가 형식 (YYYY-MM-DD) 외울 필요 없게.

---

## 8. 모달 / 오버레이

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(10, 18, 40, 0.55);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-lg);
  z-index: 100;
}
.modal {
  width: 100%;
  max-width: 700px;
  padding: 56px 60px;
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-modal);
  position: relative;
}

@media (max-width: 480px) {
  .modal {
    padding: 28px 20px;
    border-radius: var(--radius-lg);
  }
}
```

**규칙**:
- 모달은 항상 `AnimatePresence` 안에서 (열림/닫힘 애니메이션)
- ESC 키로 닫기 + 백드롭 클릭으로 닫기 (단, 진행 중/에러 상태에선 비활성)
- 모달 안에서 `overflow: hidden` 금지 (툴팁 잘림 위험)

---

## 9. 애니메이션 규칙

### 9.1 표준 ease

| 토큰 | 값 | 용도 |
|---|---|---|
| `--ease-smooth` | `cubic-bezier(0.22, 1, 0.36, 1)` | **기본** — 페이지/모달/리스트 |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 살짝 튕기는 강조 (성공 체크 등) |
| `--ease-out` | `cubic-bezier(0.0, 0.0, 0.2, 1)` | 빠르게 시작, 느리게 끝 |

### 9.2 표준 duration

| 토큰 | 값 | 용도 |
|---|---|---|
| `--duration-fast` | 150ms | 버튼 피드백, ripple |
| `--duration-normal` | 250ms | 페이지/모달 전환 |
| `--duration-slow` | 400ms | 복합 시퀀스, 강조 |

### 9.3 framer-motion 패턴

**페이지 전환 (좌우 슬라이드)**:
```jsx
const pageVariants = {
  enter: (dir) => ({ opacity: 0, x: dir * 40 }),
  center: { opacity: 1, x: 0 },
  exit:  (dir) => ({ opacity: 0, x: dir * -40 }),
}
const transition = { duration: 0.25, ease: [0.22, 1, 0.36, 1] }

<AnimatePresence mode="wait" custom={direction}>
  <motion.div
    key={step}
    custom={direction}
    variants={pageVariants}
    initial="enter" animate="center" exit="exit"
    transition={transition}
  >
    ...
  </motion.div>
</AnimatePresence>
```

**리스트 stagger**:
```jsx
const listVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
}
```

**Collapse 펼침** (height + opacity):
```jsx
const detailVariants = {
  hidden:  { opacity: 0, height: 0 },
  visible: { opacity: 1, height: 'auto', transition: { duration: 0.32, ease } },
  exit:    { opacity: 0, height: 0, transition: { duration: 0.22, ease } },
}
```

---

## 10. 안티 패턴

### ❌ 절대 금지

```jsx
/* ❌ 카드 중첩 */
<div className="page">
  <div className="card">
    <div className="card-inner">
      <Content />
    </div>
  </div>
</div>

/* ❌ 하드코딩 색상/크기 */
<div style={{ color: '#1a2f6e', padding: 16 }}>...</div>

/* ❌ 인라인 레이아웃 */
<div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>...</div>

/* ❌ overflow: hidden 으로 시각 효과 */
.tile { overflow: hidden; }  /* → 안의 툴팁/팝오버 다 잘림 */

/* ❌ 명령형 카피 */
<h1>입력하세요</h1>

/* ❌ JS 에 breakpoint 리터럴 */
if (window.innerWidth < 480) { ... }

/* ❌ 직접 fetch */
const r = await fetch('/api/foo')

/* ❌ 무한한 회색 단계 */
color: '#666', color: '#777', color: '#888'  /* 토큰 안에 정의된 3단계만 */
```

### ✅ 올바른 패턴

```jsx
/* ✅ Flat */
<div className="page-flat">
  <PageHeader title="..." />
  <Section label="..."><ListItem /></Section>
</div>

/* ✅ 토큰 사용 */
<div style={{ color: 'var(--color-primary)', padding: 'var(--space-lg)' }}>...</div>

/* ✅ CSS Module */
<div className={s.row}>...</div>

/* ✅ 자식이 모양 맞추기 (overflow 없이) */
.tile { position: relative; }
.tile::before { border-radius: var(--radius-lg); }   /* 자체 라운딩 */

/* ✅ 질문형 카피 */
<h1>어떤 걸로 할까요?</h1>

/* ✅ JS 에서도 BP 토큰 */
import { BP } from '@/constants/breakpoints'
if (window.innerWidth < BP.mobile) { ... }

/* ✅ API 레이어 */
import { fetchFoo } from '@/api'
const data = await fetchFoo()

/* ✅ 회색 위계 3단계 */
color: var(--color-dark)        /* 본문 */
color: var(--color-text-sub)    /* 보조 */
color: var(--color-gray-light)  /* 비활성 */
```

### 인라인 style 허용 기준

| 케이스 | 허용 여부 |
|---|---|
| 동적 색상 (`style={{ color: model.color_hex }}`) | ✅ 허용 |
| 동적 진행률 (`style={{ width: \`${pct}%\` }}`) | ✅ 허용 |
| `transform: rotate(180deg)` (열림/닫힘 토글) | ✅ 허용 (CSS 미디어쿼리로 못 표현) |
| `style={{ fontSize: 13 }}` 고정 수치 | ❌ → 토큰 또는 CSS Module |
| `style={{ display: 'flex', gap: 8 }}` 레이아웃 | ❌ → CSS Module |
| `style={{ width: '100%' }}` 버튼 | ❌ → `btn-full` |

---

## 11. 디렉토리 / 네이밍

### 추천 구조

```
src/
├── App.jsx
├── main.jsx                 # CSS 임포트 순서 정의
├── pages/                   # 라우트 단위 페이지
│   ├── XxxPage.jsx
│   └── XxxPage.module.css
├── components/
│   ├── common/              # 디자인 시스템 컴포넌트 (PageHeader, Section, ListItem)
│   └── feature/             # 도메인 컴포넌트
├── hooks/                   # useAuth, useMobile, ...
├── api/index.js             # 모든 fetch 함수 단일 진입점
├── constants/
│   ├── breakpoints.js       # BP.mobile, BP.tablet
│   └── domainConst.js
└── styles/                  # ★ 글로벌 CSS
    ├── variables.css        # 디자인 토큰
    ├── base.css             # reset, keyframes
    ├── layout.css           # .page-flat, .list-item, .overlay
    ├── buttons.css          # 버튼 시스템
    └── forms.css            # 폼 요소
```

### main.jsx 임포트 순서 (엄격)

```js
import './styles/variables.css'   // 1. 토큰 (다른 CSS 가 참조함)
import './styles/base.css'        // 2. 리셋, 키프레임
import './styles/layout.css'      // 3. 레이아웃 클래스
import './styles/buttons.css'     // 4. 버튼
import './styles/forms.css'       // 5. 폼

import App from './App.jsx'
ReactDOM.createRoot(...).render(<App />)
```

### 파일 네이밍

| 종류 | 패턴 | 예시 |
|---|---|---|
| 페이지 | `XxxPage.jsx` | `LoginPage.jsx`, `ExportPage.jsx` |
| 컴포넌트 | `PascalCase.jsx` | `QRScanner.jsx`, `MaterialSelector.jsx` |
| CSS Module | `ComponentName.module.css` | `LoginPage.module.css` |
| Hook | `use{Name}.js` | `useAuth.js`, `usePrint.js` |
| 상수 | `{category}Const.js` | `processConst.js` |
| Props 콜백 | `on{Action}` | `onScan`, `onConfirm`, `onCancel` |
| State | `[value, setValue]` | `[step, setStep]` |
| import alias | `@/` 프리픽스 | `@/components/common/PageHeader` |

### CSS 클래스 네이밍

- **글로벌**: `kebab-case` (`.page-flat`, `.list-item`, `.btn-primary`)
- **모듈**: 파일 내 `camelCase`, 사용 시 `s.foo` (`s.lotDisplay`, `s.headerRow`)
- **modifier**: `--` (BEM) 또는 별도 클래스 (`.list-item-key--short` 또는 `.list-item-key.short`)

---

## 12. 새 프로젝트 시작 가이드

### Step 1 — 의존성

```bash
npm i react react-dom react-router-dom framer-motion
```

### Step 2 — 파일 복사

이 문서의 [3. 디자인 토큰](#3-디자인-토큰) 의 variables.css 통째로 `src/styles/variables.css` 에 붙여넣기.

[4. 레이아웃 시스템](#4-레이아웃-시스템) → `src/styles/layout.css`
[6. 버튼 시스템](#6-버튼-시스템) → `src/styles/buttons.css`
[7. 폼](#7-폼--입력) → `src/styles/forms.css`

[5. 핵심 컴포넌트](#5-핵심-컴포넌트-패턴) 의 PageHeader / Section / ListItem → `src/components/common/`.

### Step 3 — 브랜드 색만 교체

variables.css 에서:
```css
--color-primary:  #1a2f6e;   /* 여기를 새 프로젝트 브랜드 색으로 */
--color-brand:    #1F2677;
--color-orange:   #F99535;   /* 보조 브랜드 (없으면 삭제) */
```

다른 토큰 (gray, border, divider, ripple) 은 거의 그대로 두는 게 좋습니다 — 토스 톤이 보편적이라 어디든 잘 어울림.

### Step 4 — 첫 페이지 작성

```jsx
import PageHeader from '@/components/common/PageHeader'
import Section from '@/components/common/Section'
import ListItem from '@/components/common/ListItem'

export default function HomePage() {
  return (
    <div className="page-flat">
      <PageHeader
        title="무엇을 도와드릴까요?"
        subtitle="원하는 메뉴를 골라주세요"
      />
      <Section label="자주 쓰는 기능">
        <ListItem leftKey="A" title="첫 번째" sub="설명" onClick={() => {}} />
        <ListItem leftKey="B" title="두 번째" sub="설명" onClick={() => {}} />
      </Section>
    </div>
  )
}
```

이 한 페이지부터 잘 만들면 이후 모든 페이지가 동일한 톤으로 만들어집니다.

### Step 5 — breakpoints.js

```js
// src/constants/breakpoints.js
export const BP = Object.freeze({
  mini:    360,
  mobile:  480,
  tablet:  768,
  laptop:  1024,
  desktop: 1200,
})
```

JS 에선 무조건 `BP.mobile`. CSS 미디어쿼리에선 `@media (max-width: 480px)` (한 곳에서만 정의되니까 OK).

### Step 6 — useMobile hook

```js
// src/hooks/useMobile.js
import { useEffect, useState } from 'react'
import { BP } from '@/constants/breakpoints'

export function useMobile(threshold = BP.mobile) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < threshold : false
  )
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < threshold)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [threshold])
  return isMobile
}
```

---

## 13. 마이그레이션 체크리스트

기존 프로젝트를 이 디자인 시스템으로 옮길 때.

### Phase 1 — 토큰 도입
- [ ] `variables.css` 추가
- [ ] 기존 색상 중 `#1a2f6e` 같은 리터럴을 grep 으로 찾아서 `var(--color-primary)` 로 교체
- [ ] 기존 spacing 리터럴 (`16px`, `24px`) → `var(--space-*)` 로 교체

### Phase 2 — 페이지 변환
- [ ] `.page` + `.card` 중첩 → `.page-flat` 로 평탄화
- [ ] 각 페이지 상단에 `<PageHeader>` 도입 (뒤로가기 우상단, 진입 시 스크롤 최상단)
- [ ] 카드 안의 그룹화는 `<Section label>` 로
- [ ] 카드 row → `<ListItem>` 로

### Phase 3 — 컴포넌트 정리
- [ ] 버튼: 인라인 style 제거 → `btn-{variant} btn-{size}` 매트릭스
- [ ] 폼: 직접 input style → `.form-input`, `.form-label`
- [ ] 모달: 자체 backdrop → `.overlay + .modal` 패턴
- [ ] 애니메이션: 임의 duration → `--duration-normal` 등 토큰
- [ ] easing: 임의 cubic-bezier → `--ease-smooth` 토큰

### Phase 4 — 카피 톤 정리
- [ ] 페이지 제목을 모두 **질문형** 으로 변환 ("X 입력" → "X 를 알려주세요")
- [ ] 버튼 라벨 정리 ("확인" → "이대로 진행할게요" 등 — 톤은 프로젝트 성격에 맞춰)
- [ ] 에러 메시지 정중하게 ("필수 항목" → "한 가지만 더 알려주세요")

### Phase 5 — 안티패턴 감사
- [ ] grep: `#[0-9a-fA-F]{6}` — 하드코딩 색상 검출
- [ ] grep: `style={{` — 인라인 스타일 검출 → 동적 값만 남기고 나머지 제거
- [ ] grep: `overflow: hidden` — 툴팁 클립 위험 위치 점검
- [ ] grep: `fetch\(` — API 레이어 우회 검출

### Phase 6 — 접근성 / 모바일
- [ ] 모든 버튼 min-height ≥ 44px 확인
- [ ] 리스트 row 높이 ≥ 56px
- [ ] 모바일 뷰포트에서 가로 스크롤 안 생기는지 (`box-sizing: border-box`, `min-width: 0`)
- [ ] 다크 모드 (있다면) variables 에 `prefers-color-scheme` 분기

---

## 부록 A — 자주 쓰는 토큰 조합

```css
/* "Toss row" — 가장 자주 쓰는 리스트 한 줄 */
.toss-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  min-height: 56px;
  padding: var(--space-sm) var(--space-md);
  border-bottom: 1px solid var(--color-list-divider);
  background: var(--color-surface);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-smooth);
}
.toss-row:hover { background: var(--color-ripple); }
.toss-row:active { transform: scale(0.98); }

/* "Toss chip" — 작은 상태 배지 */
.toss-chip {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: var(--text-sm);
  font-weight: var(--font-bold);
  color: var(--color-text-sub);
  background: var(--color-list-divider);
  border-radius: var(--radius-sm);
  font-variant-numeric: tabular-nums;
}

/* "Toss section spacer" — 섹션 간 여백 */
.toss-section + .toss-section {
  margin-top: var(--space-2xl);
}
```

---

## 부록 B — 한 줄 정리

> **카드를 없애고, 카피로 말 걸고, 토큰으로 일관성을 만든다.**

이 세 가지만 기억하면 토스 스타일 flat 디자인은 어디서든 재현됩니다.

---

_Last updated: 2026-05-08 — based on FD MES design system_
