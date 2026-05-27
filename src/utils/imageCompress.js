// 이미지 자동 축소 + 업로드 에러 메시지 변환 (2026-05-26)
//
// 한도 초과 이미지 → canvas 로 다운샘플 + JPEG 재인코딩.
// 외부 라이브러리 없음 — 브라우저 Canvas API 만 사용.
//
// 한계:
//   - HEIC (아이폰 기본) 같은 브라우저 미지원 포맷은 디코드 실패 → throw
//     사용자가 사진 앱에서 JPG/PNG 로 저장 후 다시 시도해야 함
//   - SVG / TIFF / RAW 도 미지원
//
// 호출자 책임:
//   - file 이 이미지인지 사전 검사 (isImageFile)
//   - 한도(maxBytes) 전달 — BE 한도보다 약간 여유있게 (nginx 우회 마진)

const IMAGE_MIME_RE = /^image\//
const IMAGE_EXT_RE  = /\.(jpe?g|png|webp|gif|bmp)$/i

export function isImageFile(file) {
  if (!file) return false
  if (IMAGE_MIME_RE.test(file.type)) return true
  return IMAGE_EXT_RE.test(file.name || '')
}

const fmtMB = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/**
 * 한도 초과 이미지를 canvas 로 자동 축소.
 *   - 한도 이하면 원본 그대로 ({ compressed: false })
 *   - 이미지 아니고 한도 초과면 throw
 *   - 디코드 실패 (HEIC 등) → throw with 한국어 안내
 *   - 압축 후에도 한도 초과면 throw
 *
 * @param {File} file
 * @param {{maxBytes:number, maxSide?:number, quality?:number}} opts
 *   maxBytes 필수. maxSide 기본 2400px (긴 변 기준). quality 기본 0.85.
 * @returns {Promise<{
 *   file: File,           // 업로드할 파일 (압축 안 됐으면 원본)
 *   compressed: boolean,
 *   originalSize?: number,
 *   compressedSize?: number,
 * }>}
 */
export async function downscaleImageIfNeeded(file, opts = {}) {
  const { maxBytes, maxSide = 2400, quality = 0.85 } = opts
  if (!file) throw new Error('파일이 없습니다.')
  if (!maxBytes) throw new Error('maxBytes 가 지정되지 않았습니다.')

  // 한도 이하면 그대로
  if (file.size <= maxBytes) return { file, compressed: false }

  // 비-이미지인데 한도 초과면 압축 불가
  if (!isImageFile(file)) {
    throw new Error(
      `파일이 너무 큽니다 (${fmtMB(file.size)}). ` +
      `한도 ${fmtMB(maxBytes)} 이하로 줄여서 시도해주세요.`,
    )
  }

  // 이미지 디코드
  const url = URL.createObjectURL(file)
  let img
  try {
    img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error(
        '이미지 디코딩 실패 — 브라우저가 지원하지 않는 포맷일 수 있어요 (예: HEIC). ' +
        '사진 앱에서 JPG/PNG 로 저장 후 다시 시도해주세요.',
      ))
      i.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }

  // 긴 변 기준으로 축소
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)

  // 점진적 quality 하향 — 한도에 맞을 때까지 (최대 4회, q 0.4 까지)
  let q = quality
  let blob = null
  for (let i = 0; i < 4; i++) {
    // eslint-disable-next-line no-await-in-loop
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', q))
    if (!blob) throw new Error('이미지 인코딩 실패')
    if (blob.size <= maxBytes) break
    q -= 0.15
    if (q < 0.4) break
  }

  if (!blob || blob.size > maxBytes) {
    throw new Error(
      `자동 압축 후에도 한도 초과 (${fmtMB(blob.size)} > ${fmtMB(maxBytes)}). ` +
      `원본이 너무 커서 더 줄일 수 없어요. 사진 앱에서 직접 크기를 줄여 다시 시도해주세요.`,
    )
  }

  const newName = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg'
  return {
    file: new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() }),
    compressed: true,
    originalSize: file.size,
    compressedSize: blob.size,
  }
}

/**
 * 업로드 에러 → 사용자 친화적 한국어 메시지 (2026-05-26).
 * fetch() 자체가 reject 한 케이스 (CORS 부작용 / 413 nginx 차단) 도 처리.
 */
export function parseUploadError(err) {
  const msg = err?.message || ''
  // CORS / 네트워크 실패 — 보통 nginx 가 413 으로 본문 차단 + CORS 헤더 누락의 부작용
  if (/Failed to fetch|NetworkError|net::ERR/i.test(msg) ||
      /CORS|Access-Control-Allow-Origin/i.test(msg)) {
    return '업로드 실패 — 파일이 서버 한도를 초과했을 가능성이 큽니다. 사진을 줄이거나 잠시 후 다시 시도해주세요.'
  }
  if (/413|too\s*large/i.test(msg) || /너무\s*큽/.test(msg)) {
    return '파일이 서버 한도를 초과했습니다. 더 작게 줄여서 시도해주세요.'
  }
  if (/세션|401/.test(msg)) {
    return '세션이 만료되었습니다. 다시 로그인 후 시도해주세요.'
  }
  if (/403|권한/i.test(msg)) {
    return '권한이 없습니다. (BOM/Item 첨부는 team_rnd 만 가능)'
  }
  if (/404|찾을 수 없/i.test(msg)) {
    return '대상을 찾을 수 없습니다. 페이지를 새로고침 후 시도해주세요.'
  }
  // BE 의 자세한 안내 (확장자/한도 초과 등) 는 그대로 노출
  return msg || '업로드 실패'
}
