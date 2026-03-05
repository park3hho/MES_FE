import { useState } from 'react'
import { printLot } from '../api'

export function usePrint(token) {
  const [printing, setPrinting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const print = async (lotNo) => {
    setPrinting(true)
    setDone(false)
    setError('')
    try {
      await printLot(lotNo, token)
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  const reset = () => {
    setDone(false)
    setError('')
  }

  return { printing, done, error, print, reset }
}
