# MES Frontend (React + Vite)

## 디렉토리 구조

```
src/
├── App.jsx              # 라우팅 + 인증 체크 + 페이지 전환
├── main.jsx             # ReactDOM + CSS 임포트 순서
├── pages/
│   ├── LoginPage.jsx
│   ├── ADMPage.jsx      # 관리자 공정 선택기
│   ├── CertPage.jsx     # 인증서 (인증 불필요)
│   ├── produce/         # 생산 공정 페이지 (RM~SO)
│   ├── shipping/        # 출하 공정 페이지 (OQ~OB)
│   └── manage/          # 관리 페이지 (Print, Inventory, Trace, Export)
├── components/
│   ├── QRScanner/       # QR 스캔 (index.jsx, QRCamera.jsx, ScanListPanel.jsx)
│   ├── MaterialSelector/# 단계별 선택기 (index.jsx, OptionButtons, StepIndicator, TextInput)
│   ├── ConfirmModal.jsx # 최종 확인 + 인쇄 상태 표시
│   ├── CountModal.jsx   # 수량 입력 (기본 / MP 중량 모드)
│   ├── BoxManager.jsx   # UB/MB 박스 관리
│   ├── InspectionForm.jsx # OQ 검사 입력
│   ├── NumPad.jsx       # 숫자 키패드 모달
│   ├── LotTimeline.jsx  # LOT 이력 타임라인
│   ├── SpecListStep.jsx # EA 스펙 목록
│   ├── CompactScanner.jsx # 인라인 QR 스캔 (BoxManager용)
│   ├── PageTransition.jsx # 페이지 전환 애니메이션
│   ├── SplashScreen.jsx  # 로그인 후 스플래시
│   ├── FaradayLogo.jsx   # 로고 컴포넌트
│   └── Inventory/        # 재고 관리 컴포넌트 세트
├── hooks/
│   ├── useAuth.js       # 로그인/로그아웃, localStorage 영속
│   ├── usePrint.js      # printLot() 래퍼 (printing/done/error 상태)
│   ├── useMobile.js     # 반응형 breakpoint 감지
│   └── utils/useDate.js # YYMMDD 포맷, 자정 자동 갱신
├── api/index.js         # 모든 API 함수 (fetch + credentials:include)
├── constants/
│   ├── processConst.js  # 공정 정의, STEPS, PROCESS_INPUT ★진실의 원천★
│   ├── etcConst.js      # 검사 기준, 치수 키, OQ 스펙
│   └── styleConst.js    # PHI 컬러, isMobile
└── styles/
    ├── variables.css    # 디자인 토큰 (컬러, 타이포, 스페이싱)
    ├── base.css         # 리셋, 애니메이션 키프레임
    ├── layout.css       # .page, .card, .overlay, .modal
    ├── buttons.css      # .btn-primary, .btn-secondary, ...
    └── forms.css        # .form-label, .form-input, .form-group
```

## 공정 페이지 패턴 (핵심)

모든 produce/shipping 페이지는 동일한 **step 상태머신** 패턴:

```jsx
function XXPage({ user, onLogout }) {
  const [step, setStep] = useState('qr')  // 또는 'selector' 등 초기 step
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  const { printing, done: printDone, error: printError, print, reset: printReset } = usePrint()

  // 에러 자동 리셋 (1.5초)
  useEffect(() => {
    if (!error) return
    const t = setTimeout(handleReset, 1500)
    return () => clearTimeout(t)
  }, [error])

  // 성공 자동 리셋 (1.2초)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(handleReset, 1200)
    return () => clearTimeout(t)
  }, [done])

  const handleReset = () => {
    setStep('qr')
    setError(null)
    setDone(false)
    printReset()
    // 모든 데이터 상태 초기화
  }

  return (
    <div className="page">
      <div className="card">
        <div className="card-header">...</div>
        {step === 'qr' && <QRScanner ... />}
        {step === 'selector' && <MaterialSelector ... />}
        {step === 'count' && <CountModal ... />}
        {step === 'confirm' && <ConfirmModal ... />}
      </div>
    </div>
  )
}
```

## 재사용 컴포넌트 Props

### QRScanner
```
processLabel: string     # 공정 한글명
onScan: (val) => void    # 단일 스캔 콜백
showList: boolean        # true면 다중 스캔 목록 모드
maxItems: number         # 목록 최대 개수
onScanList: (list, chain) => void  # 목록 완료 콜백
```

### MaterialSelector
```
steps: Array<{key, label, options|null, hint?, auto?, size?}>
onSubmit: (selections) => void
autoValues: object       # auto:true인 step에 자동 채울 값
scannedLot: string       # 이전 스캔 LOT (타임라인 표시용)
```

### CountModal
```
lotNo: string
label: string
onSelect: (num) => void
unit: string             # 'kg', '매', '개'
unit_type: string        # '중량', '매수', '개수'
maxWeight: number        # MP 중량 모드용
```

### ConfirmModal
```
lotNo: string
printCount: number
printing: boolean
done: boolean
error: string|null
onConfirm: () => void
onCancel: () => void
```

## CSS 아키텍처

임포트 순서 (main.jsx에서 반드시 이 순서):
```
1. variables.css  (디자인 토큰)
2. base.css       (리셋, 키프레임)
3. layout.css     (레이아웃 클래스)
4. buttons.css    (버튼 변형)
5. forms.css      (폼 요소)
```

컴포넌트 스타일: 같은 폴더에 `*.module.css` 파일로 코로케이션

글로벌 클래스:
- `.page` — 풀스크린 중앙 정렬
- `.card` — 흰 배경, 최대 480px, 그림자
- `.card-wide` — 넓은 카드 (관리 페이지)
- `.overlay` + `.modal` — 모달 배경 + 내용
- `.btn-primary`, `.btn-secondary`, `.btn-text`, `.btn-outline`
- `.form-label`, `.form-input`, `.form-group`, `.form-row`

## API 호출 패턴

```javascript
// api/index.js의 패턴
export async function apiName(param1, param2) {
  const r = await fetch(`/api/endpoint`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ param1, param2 }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.detail || '오류가 발생했습니다.')
  return data
}
```

## 상수 파일 규칙

`processConst.js`가 **진실의 원천**:
- `PROCESS_LIST`: 전체 공정 목록 [{code, name}]
- `XX_STEPS`: 각 공정의 MaterialSelector step 정의
- `PROCESS_INPUT`: 공정별 단위 타입 (unit_type, unit, preProcess)

새 공정 추가 시 반드시 여기 먼저 정의 후 페이지 작성.

## CSS 아키텍처 (Phase 1 완료 기준)

### 글로벌 CSS 임포트 순서 (main.jsx — 반드시 이 순서)
```
variables.css → base.css → layout.css → buttons.css → forms.css → process.css
```

### 각 파일의 역할 (엄격히 분리)

| 파일 | 담당 | 금지 |
|------|------|------|
| `variables.css` | 색상, 타이포, 스페이싱, 브레이크포인트 토큰 | 실제 클래스 정의 |
| `base.css` | 리셋, 키프레임 애니메이션 | 컴포넌트 클래스 |
| `layout.css` | `.page`, `.card`, `.overlay`, `.modal` 레이아웃 | variant별 색상 |
| `buttons.css` | 버튼 variant+size 시스템 | 레이아웃/위치 |
| `forms.css` | `.form-label`, `.form-input`, `.form-group`, `.form-row` | 버튼 스타일 |
| `process.css` | 공정 페이지 공통 패턴 (`.lot-display`, `.process-btn-row` 등) | 페이지 고유 스타일 |
| `XXPage.module.css` | 해당 페이지만의 고유 스타일 | 다른 페이지에도 쓰이는 패턴 |

### 버튼 사용 규칙 (variant × size 2축)
```jsx
// variant (외형)    + size (크기)      + modifier (너비)
<button className="btn-primary   btn-lg  btn-full">확인</button>
<button className="btn-secondary btn-md        ">취소</button>
<button className="btn-ghost     btn-sm        ">로그아웃</button>
<button className="btn-text                    ">이전으로</button>
<button className="btn-danger    btn-lg  btn-full">폐기 확인</button>
```

- `btn-primary` / `btn-secondary` — 기본 padding 내장 (size 생략 가능)
- `btn-ghost` — 아이콘/메뉴용 테두리 버튼
- `btn-text` — 링크형, min-height 없음
- `btn-outline` / `btn-confirm` — **레거시**, Phase 2에서 위로 교체 예정
- 인라인 `style={{ width }}` 버튼 크기 오버라이드 **금지**

### 모바일 반응형 규칙
- 브레이크포인트 수치: **`constants/breakpoints.js` → `BP.mobile(480)`, `BP.tablet(768)`**
- JS 코드에서 `480` 하드코딩 금지 → `BP.mobile` 사용
- 전역 레이아웃 미디어쿼리: `layout.css`, `process.css` 에서만 작성
- 컴포넌트 고유 반응형: `*.module.css` 에서 작성
- `useMobile()` 기본값 → `BP.mobile` 자동 적용

### 인라인 style="" 허용 기준
- 허용: 동적 값 (JS 변수로 결정되는 색상, 너비) → `style={{ color: PHI_SPECS[phi].color }}`
- 금지: 고정 수치 → `style={{ fontSize: 13 }}` (→ CSS 변수/클래스로)
- 금지: 레이아웃 → `style={{ display: 'flex', gap: 8 }}` (→ module.css로)

## 책임 분리 (Separation of Concerns) 규칙

### 상수 중앙화
| 상수 | 위치 | 설명 |
|------|------|------|
| `PHI_SPECS` | `constants/processConst.js` | 파이 스펙 (max, label, color) — 진실의 원천 |
| `PROCESS_LIST` | `constants/processConst.js` | 전체 공정 목록 |
| `XX_STEPS` | `constants/processConst.js` | 공정별 MaterialSelector step 정의 |
| `PROCESS_INPUT` | `constants/processConst.js` | 공정별 단위 타입 |
| 디자인 토큰 | `styles/variables.css` | 색상, 타이포, 스페이싱 |

**규칙:**
- 파이 관련 값(`87`, `70`, `45`, `20`, 색상)을 컴포넌트 파일에 하드코딩 금지 → `PHI_SPECS` import
- 새 공정별 선택지를 추가할 때 반드시 `processConst.js`부터 정의 후 페이지 작성

### API 호출 패턴
- 모든 API 함수는 `api/index.js`에만 정의
- 페이지/컴포넌트에서 직접 `fetch` 호출 금지
- 엔드포인트 경로는 `api/index.js` 함수 내에만 존재

## 새 공정 페이지 추가 체크리스트

1. `constants/processConst.js` — PROCESS_LIST, XX_STEPS, PROCESS_INPUT 추가
2. `pages/produce/XXPage.jsx` — step 상태머신 패턴으로 작성 (EAPage 참조)
3. `App.jsx` — PAGE_MAP에 매핑 추가
4. `api/index.js` — 필요 시 API 함수 추가
5. 해당 공정의 CSS Module 파일 생성 (필요 시)

## 네이밍 규칙

- 페이지 파일: `{ProcessCode}Page.jsx` (RMPage, OQPage)
- 컴포넌트 파일: `PascalCase.jsx` (QRScanner, MaterialSelector)
- CSS Module: `ComponentName.module.css`
- 훅: `use{Name}.js` (useAuth, usePrint)
- 상수: `{category}Const.js` (processConst, styleConst)
- 콜백 props: `on{Action}` (onScan, onSubmit, onConfirm, onCancel)
- 상태: `[value, setValue]` (step/setStep, error/setError)
