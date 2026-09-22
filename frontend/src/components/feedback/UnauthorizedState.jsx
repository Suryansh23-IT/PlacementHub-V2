import { ErrorState } from './ErrorState.jsx'

export function UnauthorizedState() {
  return <ErrorState message="You are not authorized to view this page." />
}
