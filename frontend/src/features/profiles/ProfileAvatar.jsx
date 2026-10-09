import { useEffect, useState } from 'react'
import { getProfileAvatar } from '../../services/profile.service.js'
import { ApexMark } from '../../components/brand/BrandLogo.jsx'
export function ProfileAvatar({ role, name, src, userId, hasAvatar, avatarVersion, token, circular = false, className = 'h-16 w-16' }) {
  const radius = circular ? 'rounded-full' : 'rounded-2xl'
  const [loaded, setLoaded] = useState(null)
  useEffect(() => {
    if (!hasAvatar || !userId || !token || role === 'placement_admin') return
    let active = true, url
    getProfileAvatar(token, userId).then(blob => { if (active) { url = URL.createObjectURL(blob); setLoaded({ userId, avatarVersion, url }) } }).catch(() => {})
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [hasAvatar, userId, avatarVersion, token, role])
  src = src || (hasAvatar && loaded?.userId === userId && loaded?.avatarVersion === avatarVersion ? loaded.url : undefined)
  if (src) return <img className={`${className} shrink-0 ${radius} object-cover`} src={src} alt={`${name} profile`} />
  if (role === 'placement_admin') return <ApexMark className={`${className} shrink-0`} label="Apex Institute of Technology logo" />
  return <svg viewBox="0 0 64 64" role="img" aria-label={role === 'company' ? 'Company default avatar' : 'Student default avatar'} className={`${className} shrink-0 ${radius} ${role === 'company' ? 'bg-indigo-100 text-indigo-800' : 'bg-sky-100 text-sky-800'}`} fill="none" xmlns="http://www.w3.org/2000/svg">
    {role === 'company' ? <><path d="M16 52V16h32v36M10 52h44M26 52V40h12v12" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><path d="M24 24h4m8 0h4m-16 8h4m8 0h4" stroke="currentColor" strokeWidth="3" /></> : <><circle cx="32" cy="25" r="10" fill="currentColor" /><path d="M13 54c1-13 8-19 19-19s18 6 19 19" fill="currentColor" /><path d="m15 13 17-7 17 7-17 7-17-7Z" fill="currentColor" /></>}
  </svg>
}
