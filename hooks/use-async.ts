'use client'

import { useState, useCallback, useRef } from 'react'

/**
 * Wraps an async function with a loading state.
 * Prevents double-invocation while a call is already in flight.
 *
 * Usage:
 *   const { loading, run } = useAsyncAction(async () => { ... })
 *   <Button loading={loading} onClick={run}>Save</Button>
 */
export function useAsyncAction<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<unknown>,
) {
  const [loading, setLoading] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const loadingRef = useRef(false)

  const run = useCallback(async (...args: TArgs) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      await fnRef.current(...args)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  return { loading, run }
}
