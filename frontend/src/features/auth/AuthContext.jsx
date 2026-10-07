import { useEffect, useState } from 'react'
import { getCurrentUser } from '../../services/auth.service.js'
import { AuthContext } from './auth.context.js'
import { sessionStorageKeyForCycle } from '../placement-cycle/placement-cycle.js'
import { usePlacementCycle } from '../placement-cycle/usePlacementCycle.js'

function readStoredSession(cycle) {
  try {
    const value = localStorage.getItem(sessionStorageKeyForCycle(cycle))
    return value ? JSON.parse(value) : null
  } catch {
    localStorage.removeItem(sessionStorageKeyForCycle(cycle))
    return null
  }
}

export function AuthProvider({ children }) {
  const { activeCycle } = usePlacementCycle()
  const [session, setSession] = useState(() => readStoredSession(activeCycle))
  const [sessionCycle, setSessionCycle] = useState(activeCycle)
  const [isRestoring, setIsRestoring] = useState(() => Boolean(readStoredSession(activeCycle)?.accessToken))
  const accessToken = session?.accessToken

  useEffect(() => {
    const restored = readStoredSession(activeCycle)
    setSessionCycle(activeCycle)
    setSession(restored)
    setIsRestoring(Boolean(restored?.accessToken))
  }, [activeCycle])

  useEffect(() => {
    if (!accessToken || sessionCycle !== activeCycle) return undefined

    let active = true
    getCurrentUser(accessToken)
      .then(({ data: user }) => {
        if (active) {
          setSession((current) => ({ ...current, user }))
        }
      })
      .catch(() => {
        if (active) {
          localStorage.removeItem(sessionStorageKeyForCycle(activeCycle))
          setSession(null)
        }
      })
      .finally(() => active && setIsRestoring(false))

    return () => { active = false }
  }, [accessToken, activeCycle, sessionCycle])

  function startSession(data) {
    localStorage.setItem(sessionStorageKeyForCycle(activeCycle), JSON.stringify(data))
    setSessionCycle(activeCycle)
    setSession(data)
  }

  function endSession() {
    localStorage.removeItem(sessionStorageKeyForCycle(activeCycle))
    setSession(null)
  }

  return <AuthContext.Provider value={{ session: sessionCycle === activeCycle ? session : null, isRestoring: isRestoring || sessionCycle !== activeCycle, startSession, endSession }}>{children}</AuthContext.Provider>
}
