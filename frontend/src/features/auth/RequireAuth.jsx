import { Navigate, useLocation } from 'react-router-dom'
import { LoadingState } from '../../components/feedback/LoadingState.jsx'
import { useAuth } from './useAuth.js'

export function RequireAuth({ children }) {
  const { session, isRestoring } = useAuth()
  const location = useLocation()

  if (isRestoring) return <LoadingState message="Restoring your session…" />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
