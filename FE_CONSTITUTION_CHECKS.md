# 🔍 FE Constitution — 자동 검증 규칙

> 이 문서는 `fe_constitution_check.py` 스크립트가 실행하는 검증 규칙을 정의합니다.

---

## 검증 타입 분류

### Critical (🔴) — 커밋 거부
```
직접 fetch 호출
axios 임포트
새 npm 패키지 설치
.env 파일 git 커밋
```

### Major (🟠) — 경고 + 수정 강제
```
공정 코드 하드코딩
새 글로벌 CSS 파일 생성
npm 린터/포매터 설치 시도
```

### Minor (🟡) — 경고만 표시
```
CSS 임포트 순서 오류
Props 주석 누락
파일 라인 수 초과
```

### Info (🟢) — 로그에만 기록
```
명명 규칙 미준수
불필요한 주석
```

---

## 검증 규칙 상세

### 1. Imports 검증

#### 1.1 절대 금지 임포트
```javascript
❌ import fetch from 'node-fetch'
❌ import axios from 'axios'
❌ import FormData from 'form-data'
❌ import sql from 'sql'

✅ Use: import from '@/api'
```

**검증 로직:**
```python
forbidden_imports = [
    'axios', 'node-fetch', 'form-data', 'sql',
    'lodash', 'moment', 'async'  # 명시적으로 금지된 패키지
]

if any(imp in file_content for imp in forbidden_imports):
    error(CRITICAL, f"금지된 import: {imp}")
```

#### 1.2 CSS 확장자 검증
```javascript
❌ import styles from './Button.scss'
❌ import styles from './Button.css'  // module.css 아님

✅ import styles from './Button.module.css'
```

**검증 로직:**
```python
# CSS import는 반드시 .module.css
if re.search(r"from\s+['\"].*\.(?!module\.css)", file_content) and 'css' in line:
    warn(MAJOR, "CSS는 .module.css만 사용")
```

---

### 2. Hardcoding 검증

#### 2.1 색상 하드코딩
```javascript
❌ color: '#FF69B4'
❌ style={{ color: '#FF69B4' }}
❌ backgroundColor: '#3498db'

✅ color: PHI_SPECS[phi].color
✅ var(--color-primary)
```

**검증 로직:**
```python
color_pattern = r'[\'"]#[0-9A-Fa-f]{6}[\'"]'
if re.search(color_pattern, file_content):
    if 'PHI_SPECS' not in file_content and 'var(--' not in file_content:
        warn(MAJOR, "색상 하드코딩. PHI_SPECS 또는 CSS 변수 사용")
```

#### 2.2 공정 코드 배열
```javascript
❌ const processes = ['RM', 'MP', 'EA', ...]
❌ if (process === 'RM') { }

✅ import { PROCESS_LIST } from '@/constants/processConst'
✅ PROCESS_LIST.find(p => p.key === process)
```

**검증 로직:**
```python
if re.search(r"\['RM'\s*,|processes\s*=\s*\[|process\s*===\s*['\"]RM['\"]", file_content):
    if 'processConst' not in file_content:
        error(CRITICAL, "공정 코드 하드코딩. processConst 사용")
```

#### 2.3 브레이크포인트 하드코딩
```javascript
❌ if (window.innerWidth <= 480) { }
❌ @media (max-width: 480px) { }

✅ import { BP } from '@/constants/breakpoints'
✅ if (window.innerWidth <= BP.mobile) { }
✅ @media (max-width: var(--bp-mobile)) { }
```

**검증 로직:**
```python
bp_pattern = r'(?:480|768|1024|1200)'
if re.search(bp_pattern, file_content):
    if 'BP.' not in file_content and 'var(--bp-' not in file_content:
        warn(MAJOR, f"브레이크포인트 하드코딩. BP 상수 또는 CSS 변수 사용")
```

---

### 3. 파일 구조 검증

#### 3.1 CSS Module 파일 쌍
```
pages/produce/EAPage.jsx
pages/produce/EAPage.module.css  ✅

pages/produce/EAPage.jsx
pages/produce/EA.module.css      ❌ (파일명 불일치)
```

**검증 로직:**
```python
# .jsx 파일이 있으면 .module.css도 있어야 함
jsx_file = 'pages/produce/EAPage.jsx'
expected_css = 'pages/produce/EAPage.module.css'
if os.path.exists(jsx_file) and not os.path.exists(expected_css):
    warn(MINOR, f"CSS Module 파일 누락: {expected_css}")
```

#### 3.2 폴더 구조 규칙
```
✅ pages/[tab]/[section]/XXXPage.jsx
✅ pages/[tab]/XXXPage.jsx

❌ pages/XXXPage.jsx  (탭 폴더 필수)
❌ pages/components/XXX.jsx  (pages 아래 components 금지)
```

**검증 로직:**
```python
if file_path.startswith('pages/') and file_path.count('/') < 2:
    if 'Page.jsx' in file_path:
        error(CRITICAL, "페이지는 pages/[tab]/[section]/XXXPage.jsx 구조 필수")
```

---

### 4. 라인 수 검증

```
컴포넌트 파일 > 500줄    → 경고
페이지 파일 > 800줄      → 에러
```

**검증 로직:**
```python
line_count = len(file_content.split('\n'))
if 'Page.jsx' in file_path and line_count > 800:
    error(MAJOR, f"페이지 파일 {line_count}줄. 리팩토링 필요")
elif file_path.startswith('components/') and line_count > 500:
    warn(MINOR, f"컴포넌트 파일 {line_count}줄. 분할 검토 필요")
```

---

### 5. 패턴 검증

#### 5.1 공정 페이지 상태머신
```javascript
// pages/produce/XXPage.jsx 또는 pages/shipping/XXPage.jsx 파일이면
// 다음을 반드시 포함해야 함

✅ const [step, setStep] = useState(...)
✅ const [error, setError] = useState(null)
✅ const [done, setDone] = useState(false)
✅ const { printing, ... } = usePrint()
✅ useEffect(() => { ... }, [error])  // 에러 리셋
✅ useEffect(() => { ... }, [done])   // 성공 리셋
```

**검증 로직:**
```python
if 'Page.jsx' in file_path and any(x in file_path for x in ['produce/', 'shipping/']):
    required_patterns = [
        r'useState\(.*step',
        r'useState\(.*error',
        r'useState\(.*done',
        r'usePrint\(\)',
        r'useEffect.*error.*1500',
        r'useEffect.*done.*1200'
    ]
    for pattern in required_patterns:
        if not re.search(pattern, file_content):
            error(MAJOR, f"공정 페이지 패턴 누락: {pattern}")
```

#### 5.2 Props 주석
```javascript
// 컴포넌트 파일에서 Props는 반드시 타입 주석 필수

❌ function QRScanner(props) { }
❌ function QRScanner({ onScan, ...}) { }

✅ function QRScanner({
     onScan,           // function: 스캔 콜백
     showList,         // boolean: 다중 모드
  }) { }
```

**검증 로직:**
```python
if file_path.startswith('components/') and 'function ' in file_content:
    # 함수 선언 후 { 안의 첫 줄이 주석인지 확인
    if re.search(r'function\s+\w+\s*\(\s*\{\s*\w+\s*[,}]', file_content):
        warn(MINOR, "Props 주석 누락. 타입 주석 추가")
```

---

### 6. CSS 임포트 순서 검증

**main.jsx에서 CSS 임포트 순서:**

```javascript
✅
import '@/styles/variables.css'   // 1
import '@/styles/base.css'        // 2
import '@/styles/layout.css'      // 3
import '@/styles/buttons.css'     // 4
import '@/styles/forms.css'       // 5
import '@/styles/process.css'     // 6

❌ 순서 바뀐 경우
import '@/styles/buttons.css'
import '@/styles/variables.css'   // 토큰 먼저 와야 함
```

**검증 로직:**
```python
css_order = [
    'variables.css',
    'base.css',
    'layout.css',
    'buttons.css',
    'forms.css',
    'process.css'
]

# main.jsx에서 CSS import 순서 추출
imports = re.findall(r"from\s+'(@/styles/[\w-]+\.css)'", file_content)
for i, imp in enumerate(imports):
    expected_idx = css_order.index(os.path.basename(imp))
    if i != expected_idx:
        error(MAJOR, f"CSS 임포트 순서 오류. {css_order} 순서 필수")
```

---

### 7. 명명 규칙 검증

```
파일명: PascalCase.jsx          (components/)
파일명: XXXPage.jsx             (pages/)
클래스명: kebab-case            (.module.css)
Props 콜백: on{Action}          (onScan, onSubmit)
상태: [value, setValue]         (const [step, setStep])
```

**검증 로직:**
```python
# 파일명 검증
if file_path.endswith('.jsx'):
    filename = os.path.basename(file_path).replace('.jsx', '')
    if file_path.startswith('pages/'):
        if not filename.endswith('Page'):
            warn(MINOR, f"페이지 파일명 오류: {filename}Page.jsx 권장")
    elif file_path.startswith('components/'):
        if not filename[0].isupper():
            warn(MINOR, f"컴포넌트 파일명: PascalCase 권장 ({filename})")

# 클래스명 검증
if file_path.endswith('.module.css'):
    invalid_classes = re.findall(r'\.([A-Z][a-zA-Z0-9]*)', file_content)
    if invalid_classes:
        warn(MINOR, f"CSS 클래스명: kebab-case 권장 (.{invalid_classes[0]}_name)")
```

---

### 8. 새 패키지 설치 검증

```
❌ npm install redux
❌ npm install --save-dev eslint

✅ npm run dev (기존 패키지만)
```

**검증 로직:**
```python
if 'npm install' in bash_command:
    error(CRITICAL, "npm install 금지. 사전 승인 필수")
```

---

## 검증 실행 방식

### Pre-Edit Hook (파일 수정 전)
```python
# Edit 도구 사용 시 자동 실행
fe_constitution_check.py --pre --file <modified_file>
```

### Post-Write Hook (파일 저장 후)
```python
# Write 도구 사용 시 자동 실행
fe_constitution_check.py --post --file <written_file>
```

### Full Check (수동 점검)
```bash
# 모든 파일 점검
python fe_constitution_check.py --full

# 특정 폴더만
python fe_constitution_check.py --full --path components/

# 특정 파일
python fe_constitution_check.py --check pages/adm/ADMPage.jsx
```

---

## 에러 로그 형식

### error_log.md에 기록되는 형식

```markdown
### [날짜] violation: 파일명 — 규칙명
- **심각도**: Critical / Major / Minor / Info
- **규칙**: 위반한 헌법 조항
- **파일**: 파일 경로
- **라인**: 위반 라인 번호 (가능한 경우)
- **메시지**: 구체적 이유 및 수정 방법
- **상태**: 수정 대기 / 수정됨 / 무시

예시:
### [2026-04-16] violation: pages/adm/ADMPage.jsx — 색상 하드코딩
- **심각도**: Major
- **규칙**: FE_CONSTITUTION.md § VI.1 (Hardcoding)
- **라인**: 45
- **메시지**: `style={{ color: '#FF69B4' }}` 발견. PHI_SPECS 또는 CSS 변수 사용
- **상태**: 수정 대기
```

---

## 자동 수정 규칙 (Optional)

일부 위반은 자동 수정 가능:

```python
# 색상 하드코딩 → PHI_SPECS로 자동 변환
'#FF69B4' → PHI_SPECS[87].color

# 브레이크포인트 → CSS 변수로 자동 변환
'480px' → 'var(--bp-mobile)'

# 임포트 순서 → 자동 재정렬
sort CSS imports by css_order list
```

---

## 세션이 준수하는 방식

1. **파일 수정 전** → `fe_constitution_check.py --pre`
2. **파일 저장 후** → `fe_constitution_check.py --post`
3. **에러 발견 시** → error_log.md에 기록
4. **매 세션 시작** → 이전 세션의 미해결 위반 표시
5. **주기적 점검** → `--full` 모드로 전체 repo 스캔
