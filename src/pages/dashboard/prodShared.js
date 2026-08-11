// pages/dashboard/prodShared.js
// 생산 대시보드 두 탭(생산 현황 / 주간 리포트) 공용 상수·포맷터.
//   ★ LOT 3분류는 BE production_weekly_service 의 _kind_of 와 같은 규약이다.
//     신규(new) / 재공정(repair, 실제 재작업) / 경유(via, 체인만 잇는 번호 → 실적 제외)

export const KIND_LABEL = { new: '신규', repair: '재공정', via: '경유' }
export const KIND_ORDER = ['new', 'repair', 'via']

// 라인 — LOT 번호는 두 라인이 채번 풀을 공유해서 번호만 봐서는 구분이 안 된다.
//   BE 가 어느 재고 테이블(StatorInventory/RotorInventory)에서 왔는지로 태깅해 내려준다.
//   라인 목록·정렬은 BE 응답(lines / by_line)을 그대로 따른다.
export const LINE_STATOR = '고정자'
export const LINE_ROTOR = '회전자'
// module.css 클래스 키 — 컴포넌트에서 s[LINE_CLASS[line]] 로 쓴다
export const LINE_CLASS = { [LINE_STATOR]: 'lnStator', [LINE_ROTOR]: 'lnRotor' }

export const STATUS_LABEL = {
  in_stock: '재고', consumed: '소비됨', discarded: '폐기', repair: '되돌림',
  in_inspection: '검사중',
}

// 집계 기준 — 어떤 구분을 '생산 실적' 숫자에 넣을지. 세 탭·매트릭스·드릴다운이 공유한다.
export const MODE_LABEL = { prod: '신규+재공정', new: '신규만', all: '경유 포함' }
export const MODE_KINDS = { prod: ['new', 'repair'], new: ['new'], all: KIND_ORDER }

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export const pad = (n) => String(n).padStart(2, '0')
export const num = (v) => (v == null ? '0' : Number(v).toLocaleString())
export const fmtYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fmtMD = (iso) => {
  if (!iso) return ''
  const [, m, dd] = iso.split('-')
  return `${Number(m)}/${Number(dd)}`
}
export const dowOf = (iso) => DOW[new Date(`${iso}T00:00:00`).getDay()]
export const isWeekend = (iso) => [0, 6].includes(new Date(`${iso}T00:00:00`).getDay())
export const fmtDT = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fmtTime = (iso) => {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export function mondayOf(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

// 다중 선택 토글 (선택 없음 = 전체)
export const toggleIn = (setter) => (v) =>
  setter((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]))
