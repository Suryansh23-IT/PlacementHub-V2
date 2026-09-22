import { useEffect, useState } from 'react'
import { getCurrentUser } from '../../services/auth.service.js'
import { AuthContext } from './auth.context.js'

const SESSION_STORAGE_KEY = 'placementhub.session'
function readStoredSession() {
  try {
    const value = localStorage.getItem(SESSION_STORAGE_KEY)
    return value ? JSON.parse(value) : null
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredSession)
  const [isRestoring, setIsRestoring] = useState(() => Boolean(readStoredSession()?.accessToken))
  const accessToken = session?.accessToken

  useEffect(() => {
    if (!accessToken) return undefined

    let active = true
    getCurrentUser(accessToken)
      .then(({ data: user }) => {
        if (active) {
          setSession((current) => ({ ...current, user }))
        }
      })
      .catch(() => {
        if (active) {
          localStorage.removeItem(SESSION_STORAGE_KEY)
          setSession(null)
        }
      })
      .finally(() => active && setIsRestoring(false))

    return () => { active = false }
  }, [accessToken])

  function startSession(data) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data))
    setSession(data)
  }

  function endSession() {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    setSession(null)
  }

  return <AuthContext.Provider value={{ session, isRestoring, startSession, endSession }}>{children}</AuthContext.Provider>
}
