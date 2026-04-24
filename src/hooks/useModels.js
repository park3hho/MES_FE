// hooks/useModels.js
// ModelsContext 소비 훅 (2026-04-24)
//
// 사용:
//   const { models, findModel, loading, reload } = useModels()
//   const color = findModel(phi, motor_type)?.color_hex ?? '#9ca3af'

import { useContext } from 'react'
import { ModelsContext } from '@/contexts/ModelsContext'

export function useModels() {
  return useContext(ModelsContext)
}
