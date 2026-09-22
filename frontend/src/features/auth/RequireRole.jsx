import { Navigate } from 'react-router-dom'
import { UnauthorizedState } from '../../components/feedback/UnauthorizedState.jsx'
import { useAuth } from './useAuth.js'

export function RequireRole({ roles, children }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  if (!roles.includes(session.user.role)) return <UnauthorizedState />
  return children
}
