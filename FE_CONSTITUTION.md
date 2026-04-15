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
    <div className="page">
      <div className="card">
        {step === 'qr' && <QRScanner onScan={...} />}
        {step === 'selector' && <MaterialSelector onSubmit={...} />}
        {step === 'count' && <CountModal onSelect={...} />}
        {step === 'confirm' && <ConfirmModal onConfirm={...} />}
      </div>
    </div>
  )
}
```

**규칙:**
- step, error, done 상태 필수
- usePrint 훅 필수
- useEffect로 자동 리셋 필수 (1.5초 / 1.2초)
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

## X. UX 심리학 법칙 (Mandatory UX Rules)

> MES는 기술적으로 정확할 뿐 아니라 심리학적으로도 설득력 있어야 합니다.
> 다음 9가지 법칙은 모든 UI/UX 결정의 기초입니다.

### X.1 제이콥의 법칙 (Jacob's Law)
```
원칙: 사용자는 다른 서비스와의 경험 기준으로 당신의 앱을 평가한다
      → MES도 Toss, 카뱅 같은 금융앱 수준의 UX 기대

MES 적용 규칙:
✅ QR 스캔 완료 후 햅틱 피드백 (휴폰처럼)
✅ 로딩 중 스피너 또는 진행률 표시 (모든 앱이 함)
✅ 에러 메시지는 명확하고 해결책 제시 (은행앱 수준)
✅ 버튼 크기는 최소 44×44px (터치 가능한 최소 크기)
✅ 폰트 크기는 최소 12px (읽기 쉬워야 함)

❌ 금지:
- MES만의 고유한 복잡한 인터페이스
- 일반 앱과 다른 제스처 (스와이프, 롱프레스 등 예상 가능해야 함)
- 비표준 아이콘 (모두가 인식하는 아이콘 사용)
```

### X.2 피츠의 법칙 (Fitts's Law)
```
원칙: 버튼까지의 거리 + 버튼 크기 = 클릭 시간
      거리 ↓, 크기 ↑ → 조작 시간 ↓

MES 적용 규칙:
✅ 자주 사용되는 버튼은 크게 (확인: 52×52px)
✅ 중요도 낮은 버튼은 작게 (취소: 40×40px)
✅ 위험한 작업 버튼(삭제)은 멀리 배치
✅ 손이 닿기 쉬운 위치: 화면 하단 중앙 (모바일)
✅ 화면 모서리는 피하기 (닿기 어려움)

❌ 금지:
- 버튼을 12×12px로 아주 작게 배치
- 중요 버튼을 화면 상단 좌측 구석에 배치
- 터치 대상 간 거리 8px 미만
```

### X.3 힉의 법칙 (Hick's Law)
```
원칙: 선택지 개수 ↑ → 의사결정 시간 ↑
      T = a + b × log₂(n)  (n = 선택지 개수)

MES 적용 규칙:
✅ 한 화면의 선택지는 최대 5개 (3~5개 최적)
✅ 선택지 많으면 필터링 또는 검색 제공
✅ 공정 선택: 모든 공정 노출 ❌ → 팀별 필터링 ✅
✅ 설비 선택: 61개 다 노출 ❌ → 최근 3개 + 검색 ✅
✅ 우선순위로 정렬 (자주 사용되는 것 위에)

❌ 금지:
- "설비 선택" 드롭다운에 61개 모두 노출
- 한 페이지에서 선택지 7개 이상
- 관련성 없는 항목 함께 표시
```

### X.4 밀러의 법칙 (Miller's Law)
```
원칙: 평균 사람은 한 번에 7±2개 항목만 기억할 수 있다
      → 정보를 청크(chunk)로 나누기

MES 적용 규칙:
✅ 긴 LOT 번호는 하이픈으로 구분: RM-2201-001-A
✅ 전화번호: 010-1234-5678 (구분 없으면 어려움)
✅ 한 화면 정보: 최대 7개 항목으로 제한
✅ 복잡한 폼은 단계별로 분할 (Step 1, 2, 3...)
✅ 검사 기준 여러 개는 탭으로 분리

❌ 금지:
- RM2201001A (구분 없음, 외우기 어려움)
- 공정페이지에서 15개 입력 필드 한번에
- 롱 리스트 페이지네이션 없이 모두 표시
```

### X.5 포스텔의 법칙 (Postel's Law)
```
원칙: "보내는 것은 엄격하게, 받는 것은 관대하게"
      → 엄격한 검증 + 친절한 에러 메시지

MES 적용 규칙:
✅ QR 코드 인식: 약간 기울어도 인식 (관대함)
✅ 날짜 입력: 다양한 형식 허용 → 자동 변환
  - 2026/4/16 → 2026-04-16
  - 26.4.16 → 2026-04-16
  - 202604 → 2026-04
✅ 공백/대소문자 자동 정리
✅ 에러는 명확하게 + 해결책 제시
✅ "숫자만 입력하세요" ❌ → "123 (최대 999)" ✅

❌ 금지:
- "잘못된 형식입니다" (무엇이 잘못됐는지 모름)
- 한 글자 다르면 전체 거부
- 에러 메시지만 있고 해결책 없음
```

### X.6 피크-엔드 법칙 (Peak-End Rule)
```
원칙: 사용자는 경험의 평균이 아니라 최고점(Peak)과 마지막(End)만 기억
      → 완료 경험을 가장 인상적으로

MES 적용 규칙:
✅ 입력 완료 후 "✅ 저장됨!" + 소리 피드백 (Peak)
✅ 스플래시 화면으로 긍정적 인상 (1.2초, 부드러운 애니메이션)
✅ 에러 발생 후 자동 복구 + "문제 해결됨" 메시지
✅ 배치 작업 완료 후 결과 요약 표시
✅ 로그아웃 시에도 "또 봐요! 👋" 메시지

❌ 금지:
- 완료 후 아무 반응 없음 (사용자가 저장됐는지 모름)
- 좋은 경험 + 버그로 인한 안 좋은 끝
- 성공 메시지 2초 후 사라지고 끝남
```

### X.7 심미적 사용성 효과 (Aesthetic-Usability Effect)
```
원칙: 보기 좋은 디자인 = 더 사용하기 쉽다고 느낌
      아름다움 + 기능성 모두 필요

MES 적용 규칙:
✅ 여백(Whitespace): 60~70% 비어있어도 OK (숨 쉰다는 느낌)
✅ 색상: 브랜드 색 일관성 (PHI_SPECS 색상 체계 준수)
✅ 타이포그래피: 정렬이 깔끔해야 함
✅ 아이콘: 일관된 스타일 (모두 같은 라이브러리)
✅ 스페이싱: 일정한 리듬 (8px의 배수)

❌ 금지:
- 정보를 빽빽하게 (답답함 ↑, 신뢰도 ↓)
- 무작위 색상 사용 (통일성 없음)
- 아이콘 섞어 쓰기 (FlatIcon + 커스텀 혼합)
- 들쭉날쭉한 여백
```

### X.8 폰 레스토프 효과 (Von Restorff Effect)
```
원칙: 튀는 것(distinctive)만 기억난다
      → 중요한 것만 강조하기

MES 적용 규칙:
✅ 주의가 필요한 것: 빨간색 (🔴 부족 재고, ❌ 에러)
✅ 완료된 것: 초록색 (✅ 입력 완료, 🟢 양호)
✅ 경고: 노란색 (⚠️ 주의, 🟡 검토 필요)
✅ 한 화면에 강조는 최대 1~2개만
✅ "중요!" 뱃지는 정말 중요한 것에만

❌ 금지:
- 모든 버튼을 빨간색으로 (강조가 없음 = 강조하지 않는 것)
- 모든 정보에 !!! 표시 (무시해짐)
- 의미 없이 색상 구분 (사용자가 혼란)
```

### X.9 테슬러의 법칙 (Tesler's Law / Law of Conservation of Complexity)
```
원칙: 시스템의 복잡도는 어디선가 나타난다
      → 프로그램이 자동화하거나, 사용자가 배워야 함

MES 적용 규칙:
✅ LOT 번호 자동 생성 (사용자가 외울 필요 없음)
✅ 날짜 자동 입력 (변경 가능하게)
✅ 최근 선택사항 기억 (반복 입력 줄이기)
✅ 복잡한 계산은 백엔드에서 (프론트는 결과만 표시)
✅ 고급 기능은 "더보기" 뒤에 (기본은 간단하게)

❌ 금지:
- 사용자가 LOT 번호를 직접 만들도록
- 매번 날짜를 손으로 입력
- 복잡한 계산 검증을 사용자에게 설명
- 모든 기능을 한 화면에 노출 (압도당함)
```

### X.10 피드백 루프 (Feedback Loop)
```
원칙: 모든 사용자 행동에 즉각적 반응 (< 200ms)
      → 통제감 ↑, 신뢰도 ↑, 답답함 ↓

MES 적용 규칙:
✅ QR 스캔 직후: 즉시 진동 + 사운드
✅ 버튼 클릭: 0.1초 내 시각적 변화 (누른 느낌)
✅ 네트워크 요청 중: 로딩 스피너 + "저장 중..."
✅ 입력 완료: 토스트 메시지 + 자동 리셋 (1.2초)
✅ 에러 발생: 빨간색 경고 + 3초 후 자동 복구
✅ 인쇄 중: 진행 상황 표시 (1%, 50%, 100%)

❌ 금지:
- 클릭했는데 아무 반응 없음 (더블 클릭 유발)
- "로딩 중"이라는 텍스트만 있고 스피너 없음
- 요청 보낸 후 response 없이 화면 그대로
- 5초 이상 반응 없음 (사용자가 포기함)
```

---

## XI. UX 심리학 규칙 검증

### 자동 검증 항목
```python
# fe_constitution_check.py에 추가될 검증

1. 버튼 크기 (피츠의 법칙)
   ✅ 주요 버튼: 40px ≤ height ≤ 60px
   ❌ 버튼: height < 40px → 경고

2. 선택지 개수 (힉의 법칙)
   ✅ 한 폼/드롭다운: options.length ≤ 5
   ❌ 6개 이상 → 경고 (검색 추가 권장)

3. 정보 청킹 (밀러의 법칙)
   ✅ 화면 항목: <= 7개
   ❌ 8개 이상 → "Step 분할 권장" 경고

4. 강조 색상 (폰 레스토프 효과)
   ✅ 강조(색상): 한 화면에 1~2개
   ❌ 3개 이상 → "강조가 없는 것과 같음" 경고

5. 피드백 (피드백 루프)
   ✅ 모든 onClick: feedback 함수 호출
   ❌ feedback 없는 버튼 → "피드백 추가" 경고
```

---

**최종 원칙:**
> 이 헌법을 지키지 않는 코드는 프로덕션에 갈 수 없습니다.  
> 모든 세션은 자동 검증으로 규칙 위반을 즉시 감지하고 수정합니다.  
> **특히 UX 심리학은 "기술"이 아니라 "필수"입니다.**
