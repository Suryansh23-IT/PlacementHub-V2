const dashboardForRole = role => role === 'placement_admin' ? '/admin/dashboard' : '/dashboard'

export function loginDestinationForRole(role, requestedPath) {
  const fallback = dashboardForRole(role)
  if (typeof requestedPath !== 'string' || !requestedPath.startsWith('/')) return fallback

  if (requestedPath.startsWith('/admin/')) return role === 'placement_admin' ? requestedPath : fallback
  if (requestedPath.startsWith('/student/')) return role === 'student' ? requestedPath : fallback
  if (requestedPath.startsWith('/company/')) return role === 'company' ? requestedPath : fallback

  return requestedPath
}
