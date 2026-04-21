// ══════════════════════════════════════════════════════════════
// usePWAInstall — PWA 설치 상태/트리거 관리 훅
// ══════════════════════════════════════════════════════════════
// Android Chrome: beforeinstallprompt 이벤트 캐치 → prompt() 제공
// iOS Safari:     자동 설치 불가 → 수동 안내 플래그만 노출
// 이미 설치됨:    standalone 모드 감지 → installed=true

import { useEffect, useState, useCallback } from 'react'

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null) // Android Chrome 이벤트 핸들
  const [installed, setInstalled] = useState(false)          // 이미 설치됨 여부
  const [isIOS, setIsIOS] = useState(false)                  // iOS Safari 플래그

  useEffect(() => {
    // 이미 설치된 경우 (홈화면에서 실행 중)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true  // iOS Safari 플래그
    if (standalone) {
      setInstalled(true)
      return
    }

    // iOS Safari 감지 (iPad/iPhone/iPod + Safari)
    const ua = window.navigator.userAgent
    const iOSDevice = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    setIsIOS(iOSDevice && isSafari)

    // Android Chrome: 설치 가능 조건 만족 시 이벤트 발생
    const handleBeforeInstall = (e) => {
      e.preventDefault()            // 기본 미니 인포바 차단
      setDeferredPrompt(e)          // 우리가 원할 때 띄우도록 저장
    }

    // 설치 완료 이벤트
    const handleInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  // Android Chrome 설치 트리거
  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return 'unavailable'
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice  // 'accepted' | 'dismissed'
    setDeferredPrompt(null)
    return outcome
  }, [deferredPrompt])

  // 설치 가능 여부 — 메뉴 표시 조건
  const canInstall = Boolean(deferredPrompt) || isIOS

  return {
    installed,          // boolean: 이미 설치됨
    isIOS,              // boolean: iOS Safari (수동 안내 필요)
    canInstall,         // boolean: 메뉴에 "앱 설치" 노출 가능
    promptInstall,      // function: Android Chrome 설치 다이얼로그 띄우기
    hasAndroidPrompt: Boolean(deferredPrompt),  // Android: 자동 설치 가능
  }
}
