import { useEffect, useRef } from 'react'

/**
 * Silently re-runs `callback` on an interval, plus immediately whenever the
 * tab/window regains focus (covers a screen that was asleep/backgrounded
 * through a change) — same pattern StaffMenuPage already uses to keep the
 * staff tablet in sync without a manual reload, applied here to admin/staff
 * views that watch for new orders or bills.
 *
 * - Silent: no loading spinner, no error surfaced on a failed poll — a
 *   temporary network blip just means the next tick tries again with
 *   whatever data is already on screen.
 * - Never overlaps: a slow poll won't stack a second request on top of one
 *   still in flight.
 * - Always calls the latest `callback` (via a ref) without needing it in
 *   the effect's dependency array, so callers can pass an inline function.
 */
export function usePolling(callback, intervalMs = 15000) {
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    let inFlight = false

    const tick = () => {
      if (inFlight) return
      inFlight = true
      Promise.resolve()
        .then(() => callbackRef.current())
        .catch(() => {
          // Silent — background refresh, not a user-initiated load.
        })
        .finally(() => {
          inFlight = false
        })
    }

    const interval = setInterval(tick, intervalMs)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', tick)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs])
}
