// constants/notifyConst.js
// 알림 종류 — BE core/notify_config.py 와 동기 필수 (check_enum_sync 대상).
//   ★ 새 이메일 알림 추가 시: BE NOTIFY_TYPES + 여기 둘 다 추가하면 알림 수신 설정 화면에 자동 노출.
//   (라벨/설명은 BE 카탈로그 API 가 내려주므로 화면은 그걸 우선 사용 — 여기는 동기 검증용 SSOT)
export const NOTIFY_TYPES = ['safety_stock', 'daily_close']

export const NOTIFY_TYPE_LABELS = {
  safety_stock: '안전재고 부족 알림',
  daily_close: '일일 마감 완료 알림',
}
