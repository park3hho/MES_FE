# 🏛️ MES Frontend Constitution (프론트엔드 헌법)

> 모든 세션이 반드시 지켜야 할 **절대 규칙**. 위반 시 자동 감지 및 에러 로그.

---

## 0. 예외 규정 (2026-04-16 개정)

아래 경우는 헌법 위반이 **아니며 자동 검증에서 제외**해야 함:

### 0.1 글로벌 CSS 파일 (`.module.css` 예외)
`src/styles/`의 6개 글로벌 CSS 파일은 **`.module.css` 규칙 미적용**:
`variables.css`, `base.css`, `layout.css`, `buttons.css`, `forms.css`, `process.css`
→ 글로벌 스코프가 의도된 파일. 모듈화 금지.

### 0.2 CSS 미디어쿼리의 숫자 리터럴
`@media (max-width: 480px)` 형태로 하드코딩된 숫자는 **허용**.
이유: CSS 미디어쿼리는 `var(--bp-*)`를 파싱하지 못하는 브라우저 제약.
→ `variables.css`의 `--bp-*` 토큰은 **문서화 및 JS 참조용**.
→ PostCSS `postcss-custom-media` 플러그인 도입 전까지 이 예외 유지.

### 0.3 진실의 원천 파일
`constants/breakpoints.js`와 `styles/variables.css`는 **진실의 원천**이므로
숫자 리터럴/색상 hex 정의가 당연. 이 파일들은 하드코딩 검증 대상 아님.

### 0.4 PWA / 빌드 설정
`vite.config.js`의 `VitePWA` manifest(`theme_color`, `background_color`)는
**빌드 시 평가**되는 설정이라 CSS 변수 접근 불가 → 색상 리터럴 허용.

### 0.5 폴더 인덱스 패턴
`components/ComponentName/index.jsx` 패턴 (React 표준) 허용.
체커의 "파일명: Index.jsx 권장" 경고는 오탐.

### 0.6 useAutoReset 훅 사용 페이지
공정 페이지에서 `useAutoReset(error, done, handleReset)` 훅을 쓰면
헌법 §IV.1의 `useEffect for error/done reset` 요구사항을 충족한 것으로 간주.
(useEffect 로직이 훅 내부로 추상화된 진화된 패턴)

### 0.7 단순/위임 페이지 예외
다음 페이지는 step 상태머신 패턴 예외:
- **RMPage**: 1-step 단일 플로우로 step 상태 불필요
- **MBPage / UBPage**: 전체 플로우를 `BoxManager`에 위임하는 구조로 step/error/done 상태 불필요

### 0.8 JUDGMENT_COLORS (런타임 hex 사용)
`etcConst.js`의 `JUDGMENT_COLORS`는 **hex 유지** + 인라인 주석으로
`variables.css`의 `--color-judgment-*` 토큰과 동기화 관리.
SSR/early-render 시 `getComputedStyle` 실패 가능성 회피 목적.

### 0.9 Chart.js 런타임 테마
`LinesChartPage.jsx`는 Chart.js에 JS 문자열로 색상을 주입해야 하므로
`readCssVar()` 헬퍼로 `--chart-*` 토큰을 읽어 `theme` 객체 구성.
이 패턴을 Chart.js 기반 페이지의 표준으로 허용.

### 0.10 rgba() 반투명 색상
`backgroundColor: 'rgba(59,130,246,0.28)'` 같은 투명도 포함 색상은
토큰화가 번거로움. 같은 hex가 별도 토큰과 매칭될 때만 주석으로 연결.

---

## 🎯 0.5 Toss 스타일 디자인 철학 (최상위 원칙)

> **⚠️ 이 섹션은 UI 설계 시 어떤 다른 원칙보다 우선한다.**
> 새 페이지/컴포넌트를 만들거나 기존 UI를 수정할 때 **반드시** 아래 원칙을 따를 것.

### 🚫 카드 래퍼 사용 금지 (`.card` 최소화)

**사용자 확정 지시 (2026-04-16~):** 중첩된 `.card` 래퍼는 **전면 제거**되었음.

```jsx
// ❌ 금지 — 이미 퇴출된 구닥다리 패턴
<div className="page">
  <div className="card">           {/* 480px max-width, shadow, 중앙 정렬 */}
    <div className="card-header">...</div>
    <MaterialSelector />
  </div>
</div>

// ✅ 권장 — Toss 스타일 flat 레이아웃
<div className="page-flat">         {/* 풀와이드, shadow 없음, 중앙 정렬 X */}
  <PageHeader title="공정을 고를까요?" />
  <MaterialSelector />
</div>
```

**이미 제공된 도구 (layout.css / variables.css):**
- `.page-flat` — 흰 배경 풀스크린 (`--color-page-flat: #ffffff`)
- `.page-scan` — 다크 배경 풀스크린 (QR 스캐너용)
- `.list-item` — 카드 대신 행 단위 리스트 (border 없이 얇은 구분선)
- `.sticky-cta` — 하단 고정 CTA 버튼 영역
- `--color-list-divider` (`#f0f2f6`) — 거의 안 보이는 얇은 구분선
- `--color-ripple` (`#eef1f8`) — 탭 시 배경 피드백
- `--color-text-sub` (`#5f6b7a`) — 명암비 개선된 보조 텍스트

### 🎨 Toss 핵심 원칙 7가지 (UI 설계 시 모두 적용)

```
1️⃣ 1 스크린 = 1 질문 (Progressive Disclosure)
   각 화면은 한 가지 결정만 유도. 부가 정보는 회색 얇게.

2️⃣ 대화형 카피 (명령형 → 질문형)
   "입력하세요" ❌  →  "어떤 걸로 할까요?" ✅

3️⃣ Flat 레이아웃 (카드 금지)
   shadow / border / max-width 제거. 구분선은 1px #f0f2f6 얇게.

4️⃣ 큰 터치 영역 (피츠의 법칙)
   버튼 min-height 44px, 리스트 row 56px 이상.

5️⃣ 즉각적 피드백
   탭 시 ripple(--color-ripple), 성공 시 1.2초 자동 리셋.

6️⃣ 일관된 여백 (8px grid)
   모든 간격은 var(--space-*) 토큰만 사용 (xs=4, sm=8, md=12, lg=16, xl=24).

7️⃣ 명암비 높은 텍스트
   보조 텍스트는 --color-text-sub (#5f6b7a), 옅은 --color-gray-light(#adb4c2)는 비활성만.
```

### 📏 자동 검증 규칙 (fe_constitution_check.py)

다음 패턴 발견 시 **경고**:
- `className=".*\bcard\b"` — 글로벌 `.card` 사용 (예외: `.card-header` 내부, BoxCheckPage 등 이미 리팩된 케이스는 허용)
- `maxWidth: '480px'` / `max-width: 480px` 인라인 — 풀와이드 위반
- 카드 없이 과도한 `box-shadow` / `border-radius: 12px+` 남용

### ✅ 이미 완료된 전환 (참고)
- `MaterialSelector` — `.card` 래퍼 제거 완료
- `ConfirmModal`, `CountModal` — 풀스크린/바텀시트 전환 완료
- 모든 공정 페이지(11개) — `.page > .card` → `.page-flat`
- `SpecListStep`, `PrintPage` — Toss 전환
- `QRScanner` — PC 반응형 + 뒤로가기 화살표 통일

### 🚧 잔여 작업
- LoginPage, TracePage, LotManagePage, InspectionForm — 완전 flat 전환 검토
- 레거시 `.card` 사용처 grep으로 정기 감사

### 📚 참고 자료
- WORK_STATE.md의 "🔜 추후 작업 — Toss 스타일 UI 리뉴얼" 섹션
- Toss 결제 플로우 캡처 (계좌 선택 → 금액 → 확인 → 완료)

---

## I. 진실의 원천 (Single Source of Truth)

### 1.1 공정 정의 중앙화
```javascript
// ✅ MUST: processConst.js에서만 정의
import { PROCESS_LIST, RM_STEPS, PHI_SPECS } from '@/constants/processConst'

// ❌ NEVER: 컴포넌트 파일에 하드코딩
const processes = ['RM', 'MP', 'EA', ...] // 금지
const phis = { 87: '#FF69B4', 70: '#FFB07C' } // 금지
```

**규칙:**
- 공정 코드, 레이블, STEPS, PROCESS_INPUT → `processConst.js`에만 정의
- 파이 스펙(87, 70, 45, 20)과 색상 → `PHI_SPECS` 상수 사용
- 컴포넌트 파일에서 하드코딩된 배열/객체 발견 시 → **에러**

### 1.2 API 엔드포인트 중앙화
```javascript
// ✅ MUST: api/index.js에만 정의
export const scanLot = (process, lotNo) => 
  postJson(`${BASE_URL}/lot/${process}/scan`, { lot_no: lotNo })

// ❌ NEVER: 페이지에서 fetch 직접 호출
const res = await fetch(`/api/lot/RM/scan`, ...) // 금지
```

**규칙:**
- 모든 API 함수는 `api/index.js`에만 정의
- 페이지/컴포넌트에서 직접 `fetch`, `axios` 호출 금지
- 새 엔드포인트 추가 → 먼저 `api/index.js`에 함수 작성

### 1.3 디자인 토큰 중앙화
```css
/* ✅ MUST: variables.css에만 정의 */
--color-primary: #3498db;
--spacing-base: 8px;
--bp-mobile: 480px;

/* ❌ NEVER: 컴포넌트 스타일에 하드코딩 */
color: #3498db; /* 금지 */
padding: 8px; /* 금지 */
@media (max-width: 480px) { } /* 금지 */
```

**규칙:**
- 색상, 타이포, 스페이싱, 브레이크포인트 → `variables.css`에만 정의
- `.module.css`에서는 **토큰 참조만** 사용 (`var(--color-primary)`)
- 하드코딩된 색상/수치 발견 → **경고**

---

## II. 구조적 규칙 (Architectural Rules)

### 2.1 파일 위치 규칙 (Colocate as Needed)
```
✅ 올바른 구조
pages/adm/manage/
├── PrintPage.jsx
├── PrintPage.module.css
└── components/
    ├── PrintQRInput.jsx
    ├── PrintQRInput.module.css
    └── PrintPreview.jsx

❌ 금지된 구조
components/
├── ADMPagePrintQRInput.jsx     // 페이지명 접두사 금지
├── PrintQRInput.styles.js      // .module.css 외 스타일 금지
└── PrintQRInput/
    ├── index.jsx
    ├── PrintQRInput.jsx        // 폴더 + 파일명 중복 금지
    └── styles.css
```

**규칙:**
- 페이지는 `pages/[tab]/[section]/XXXPage.jsx` + `XXXPage.module.css`
- 컴포넌트는 `components/ComponentName.jsx` + `ComponentName.module.css`
- 컴포넌트 폴더 구조는 **필요한 경우만** (3개 이상 서브 파일)
- 새로운 스타일 확장자 (`.styles.js`, `.styles.ts`) 금지

### 2.2 CSS 레이어 분리 (Strict Separation)
```javascript
// main.jsx의 임포트 순서 — 반드시 이 순서
import '@/styles/variables.css'   // 1️⃣ 토큰만
import '@/styles/base.css'        // 2️⃣ 리셋, 키프레임
import '@/styles/layout.css'      // 3️⃣ .page, .card, .overlay
import '@/styles/buttons.css'     // 4️⃣ 버튼 variant/size
import '@/styles/forms.css'       // 5️⃣ 폼 요소
import '@/styles/process.css'     // 6️⃣ 공정 페이지 공통
```

**각 파일의 책임:**

| 파일 | 정의해야 함 | 금지 |
|------|------------|------|
| `variables.css` | 색상, 타이포, 스페이싱, 브레이크포인트 토큰 | 실제 클래스 |
| `base.css` | body 리셋, `@keyframes` 애니메이션 정의 | 컴포넌트 클래스 |
| `layout.css` | `.page`, `.card`, `.card-wide`, `.overlay`, `.modal` | 버튼, 폼 스타일 |
| `buttons.css` | `.btn-[variant]`, `.btn-[size]`, `.btn-[modifier]` 조합 | 레이아웃, 위치 |
| `forms.css` | `.form-label`, `.form-input`, `.form-group`, `.form-row` | 버튼, 색상 변형 |
| `process.css` | 공정 페이지 공통 패턴 (`.lot-display`, `.process-btn-row`) | 페이지 고유 스타일 |
| `XXPage.module.css` | 해당 페이지만의 고유 스타일 | 다른 페이지에도 쓰이는 패턴 |

**규칙:**
- CSS 파일 순서 변경 금지
- 새 글로벌 CSS 추가 → `process.css` 또는 `layout.css`에만 추가
- 컴포넌트 고유 스타일은 반드시 `.module.css`
- 전역 스타일과 모듈 스타일 혼합 금지

### 2.3 버튼 시스템 (Variant × Size Matrix)
```jsx
// ✅ 올바른 사용
<button className="btn-primary btn-lg btn-full">확인</button>
<button className="btn-secondary btn-md">취소</button>
<button className="btn-ghost btn-sm">이전</button>
<button className="btn-text">링크형</button>
<button className="btn-danger btn-lg btn-full">삭제 확인</button>

// ❌ 금지된 사용
<button className="btn-primary-large">금지</button>              // 복합명 금지
<button style={{ width: '100%' }}>금지</button>                  // 인라인 스타일
<button className="btn btn-custom">금지</button>                 // 커스텀 변형
<a className="btn-primary">링크는 button이 아님</button>         // 의미론적 오류
```

**규칙:**
- variant (primary/secondary/ghost/text/danger) + size (lg/md/sm) + modifier (full)
- 새로운 버튼 스타일 추가 → `buttons.css`에만 추가
- 인라인 `style={{ }}` 버튼 스타일 금지 (동적 색상 제외)
- 레거시 클래스 (`.btn-outline`, `.btn-confirm`) 금지

### 2.4 반응형 규칙 (Single Breakpoint System)
```javascript
// ✅ MUST: breakpoints 상수 사용
import { BP } from '@/constants/breakpoints'
const isMobile = window.innerWidth <= BP.mobile // 480px

// ✅ MUST: variables.css 토큰 사용
@media (max-width: var(--bp-mobile)) { }

// ❌ NEVER: 하드코딩
const isMobile = window.innerWidth <= 480 // 금지
@media (max-width: 480px) { }             // 금지
@media (max-width: 768px) { }             // 임의 수치 금지
```

**규칙:**
- 브레이크포인트: `BP.mobile(480px)`, `BP.tablet(768px)` (여기서만 정의)
- JS에서 `480`, `768` 하드코딩 금지
- CSS에서 `480px`, `768px` 하드코딩 금지
- 각 미디어쿼리는 `variables.css`의 토큰 참조

---

## III. 명명 규칙 (Naming Convention)

```javascript
// ✅ 올바른 명명
pages/produce/EAPage.jsx              // 파일: {ProcessCode}Page.jsx
components/QRScanner.jsx              // 컴포넌트: PascalCase.jsx
hooks/useAuth.js                      // 훅: use{Name}.js
constants/processConst.js             // 상수: {category}Const.js

// 클래스명
.lot-display                          // 케밥 케이스
.process-btn-row
.form-input-error

// Props 콜백
<Component onScan={...} />             // on{Action}
<Component onSubmit={...} />
<Component onConfirm={...} />

// 상태명
const [step, setStep] = useState()     // [value, setValue]
const [error, setError] = useState()

// ❌ 금지된 명명
components/ADMPagePrintQRInput.jsx     // 페이지명 접두사 금지
pages/PrintPage.module.scss            // .scss 금지 (CSS만)
hooks/authHook.js                      // use 접두사 필수
const handleOnClick = () => {}         // handle + on 중복 금지
<Component onCLICK={...} />            // 대문자 금지 (camelCase)
```

---

## IV. 패턴 규칙 (Pattern Rules)

### 4.1 공정 페이지 상태머신 (Mandatory Pattern)
```javascript
// ✅ MUST: 모든 produce/shipping 페이지는 이 패턴 사용
function XXPage({ onLogout, onBack }) {
  const [step, setStep] = useState('qr')           // 초기 step
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const { printing, done: printDone, error: printError, print, reset: printReset } = usePrint()

  // 에러 자동 리셋 (1.5초)
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => {
      setStep('qr')
      setError(null)
    }, 1500)
    return () => clearTimeout(t)
  }, [error])

  // 성공 자동 리셋 (1.2초)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => {
      setStep('qr')
      setDone(false)
      printReset()
    }, 1200)
    return () => clearTimeout(t)
  }, [done])

  return (
    <div className="page-flat">
      {/* ★ .card 래퍼 사용 금지 (Toss flat 정책 — §0.5). 직접 콘텐츠 배치. */}
      {step === 'qr' && <QRScanner onScan={...} />}
      {step === 'selector' && <MaterialSelector onSubmit={...} />}
      {step === 'count' && <CountModal onSelect={...} />}
      {step === 'confirm' && <ConfirmModal onConfirm={...} />}
    </div>
  )
}
```

**규칙:**
- step, error, done 상태 필수
- usePrint 또는 `useAutoReset`(§0.6) 훅 사용 — 둘 중 하나
- useEffect로 자동 리셋 필수 (1.5초 / 1.2초)
- 래퍼는 `.page-flat` (`.card` 금지 — §0.5)
- 이 패턴을 무시한 공정 페이지 발견 → **에러**

### 4.2 컴포넌트 Props 계약 (Props Contract)
```javascript
// ✅ MUST: Props 타입 주석 필수
function QRScanner({ 
  processLabel,      // string: 공정 한글명
  onScan,            // function: 스캔 콜백
  showList,          // boolean: 다중 스캔 모드
  maxItems,          // number: 최대 아이템 수
  onScanList,        // function: 다중 스캔 완료 콜백
}) { ... }

// ❌ 금지
function QRScanner(props) { ... }  // props 분해 필수
```

**규칙:**
- 모든 컴포넌트 props는 분해 + 타입 주석 필수
- Props 주석이 없거나 불완전 → **경고**

### 4.3 새 공정 페이지 체크리스트 (Mandatory Steps)
```
[ ] 1. constants/processConst.js — PROCESS_LIST, XX_STEPS, PROCESS_INPUT 추가
[ ] 2. pages/produce/XXPage.jsx — 공정 페이지 작성 (상태머신 패턴)
[ ] 3. App.jsx — pageMap에 라우팅 추가
[ ] 4. api/index.js — API 함수 추가 (필요 시)
[ ] 5. XXPage.module.css — 고유 스타일 작성 (필요 시)

이 체크리스트를 무시한 커밋 발견 → **에러**
```

---

## V. 금지 규칙 (Absolute Prohibitions)

### 5.1 절대 금지
```javascript
// ❌ 1. 직접 fetch 호출
const res = await fetch(`/api/...`) // api/index.js 함수 사용
await axios.get(...)                // axios 설치 금지

// ❌ 2. 공정 코드 하드코딩
if (process === 'RM') { }           // processConst.PROCESS_LIST 사용
const processes = ['RM', 'MP', ...]

// ❌ 3. 새 npm 패키지 설치
npm install react-beautiful-dnd     // 사전 승인 필수

// ❌ 4. .env 파일 git 커밋
git add .env                        // .gitignore에 이미 등록됨

// ❌ 5. 새 글로벌 CSS 파일 생성
touch src/styles/new-style.css      // process.css 또는 layout.css에 추가

// ❌ 6. 린터 설정 변경
npm install eslint                  // 린터 설치 금지
touch .eslintrc.json                // settings.local.json에서만 관리

// ❌ 7. 마이그레이션 파일 수정
git checkout HEAD -- MES_FE/...     // 기존 마이그레이션은 불변
```

### 5.2 인라인 style 규칙 (Strict)
```javascript
// ✅ 허용: 동적 값
<div style={{ color: PHI_SPECS[phi].color }}>컬러</div>

// ❌ 금지: 고정 수치
<div style={{ padding: '8px' }}>금지</div>           // CSS 변수 사용
<div style={{ display: 'flex', gap: 8 }}>금지</div> // module.css 사용
```

---

## VI. 자동 검증 규칙 (Enforcement)

### 6.1 Pre-Edit Hook (파일 수정 전)
```
1. 파일 경로 검증
   - pages/xxx.jsx → 올바른 폴더 구조 확인
   - constants/ → processConst.js만 수정 가능 (다른 상수 파일 금지)

2. 임포트 검증
   - 직접 fetch 임포트 금지
   - axios 임포트 금지
   - 새로운 CSS 확장자 금지

3. 하드코딩 검증
   - 색상 하드코딩 (# 로 시작하는 16진수)
   - 브레이크포인트 하드코딩 (480, 768 등)
   - 공정 코드 배열 하드코딩
```

### 6.2 Post-Write Hook (파일 수정 후)
```
1. CSS 순서 검증
   - main.jsx의 CSS 임포트 순서 확인

2. 라인 수 체크
   - 컴포넌트 파일 500줄 초과 경고
   - page 파일 800줄 초과 에러

3. 구조 검증
   - .module.css 파일 생성 시 대응하는 .jsx 확인
```

---

## VII. 침해 시 조치 (Violation Penalties)

| 심각도 | 위반 사항 | 조치 |
|--------|---------|------|
| 🔴 Critical | 직접 fetch 호출, npm 패키지 임의 설치 | 커밋 거부 + 에러 로그 |
| 🟠 Major | 공정 코드 하드코딩, 새 글로벌 CSS 파일 | 경고 + 수정 강제 |
| 🟡 Minor | 임포트 순서 오류, 주석 누락 | 경고만 표시 |
| 🟢 Info | 명명 규칙 미준수, 불필요한 주석 | 로그에만 기록 |

---

## VIII. 참고: 기존 가이드

이 헌법은 다음 파일들의 규칙을 **강제**합니다:
- `CLAUDE.md` — 프로젝트 전체 규칙
- `MES_FE/CLAUDE.md` — 프론트엔드 상세 가이드

**차이점:**
- `CLAUDE.md` — 추천 사항 (should)
- `MES_FE/CLAUDE.md` — 상세 설명 (how-to)
- **`FE_CONSTITUTION.md`** — 절대 규칙 (must) + 자동 검증

---

## IX. 세션이 지키는 방법

### 자동 검증 훅
```bash
# PreToolUse (Edit 전)
py .claude/hooks/fe_constitution_check.py --pre

# PostToolUse (Write 후)
py .claude/hooks/fe_constitution_check.py --post

# 에러 로그
cat .claude/error_log.md
```

### 수동 검증 (세션이 주기적으로)
```bash
# 전체 규칙 점검
py .claude/hooks/fe_constitution_check.py --full

# 특정 파일 점검
py .claude/hooks/fe_constitution_check.py --file pages/adm/ADMPage.jsx
```

---

## 참고 가이드 (헌법 ≠ 강제 규칙이지만 권장)

본 헌법은 자동 검증되는 **강제 규칙**만 다룹니다. 자동 검증 불가 / 디자인 의사결정 참조용 가이드는 별도 문서로 분리:

- 📐 [UX 심리학 법칙 가이드](../docs/ui/ux-principles.md) — 제이콥/피츠/힉/밀러/포스텔/피크엔드/심미적 사용성/폰레스토프/테슬러/피드백 루프 10법칙
- 🦴 [스켈레톤 UI 가이드](../docs/ui/skeleton-guide.md) — 스켈레톤 사용 기준·스타일·구현 패턴·검증

(2026-05-27 분리 — 구 §X·§XI·§XII. 강제력은 0 이었지만 디자인 작업 시 참조 가치 보존.)

---

