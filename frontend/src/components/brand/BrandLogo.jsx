import { Link } from 'react-router-dom'

export function ApexMark({ className = 'h-10 w-10', label = 'Apex Institute of Technology' }) {
  return <svg className={className} viewBox="0 0 64 64" role="img" aria-label={label} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="apex-blue" x1="9" y1="10" x2="55" y2="56" gradientUnits="userSpaceOnUse"><stop stopColor="#16C7F7" /><stop offset=".52" stopColor="#3568F5" /><stop offset="1" stopColor="#1D4ED8" /></linearGradient>
      <linearGradient id="apex-ink" x1="8" y1="5" x2="58" y2="59" gradientUnits="userSpaceOnUse"><stop stopColor="#0B2158" /><stop offset="1" stopColor="#020A2A" /></linearGradient>
    </defs>
    <path d="M10 18 32 6l22 12-4 4-18-9-18 9-4-4Z" fill="url(#apex-ink)" />
    <path d="M18 20v9c0 2-1 3-3 4v-13h3Zm29 0v13c-2-1-3-2-3-4v-9h3Z" fill="#0B2158" />
    <path d="M30.7 17.5 9.5 51.3c-1.4 2.3 1.3 4.8 3.5 3.1l19-14.8 7.2 9.5c1.5 2 4.5 1.6 5.5-.7l7.6-18c.7-1.8-1.5-3.3-3-2L36.5 35l-5.8-17.5Z" fill="url(#apex-blue)" />
    <path d="m20 50.5 12-10.9 7.2 9.5c1.5 2 4.5 1.6 5.5-.7l7.6-18-20 17-12 3Z" fill="#174EA6" opacity=".7" />
    <path d="M55 13.5 57 19l5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2 2-5.5Z" fill="#60A5FA" />
  </svg>
}

export function BrandLogo({ className = '', compact = false, inverse = false, link = true, institution = true, to = '/' }) {
  const content = <span className={`brand-logo ${inverse ? 'brand-logo-inverse' : ''} ${className}`}>
    <span className="brand-logo-mark"><ApexMark className="h-9 w-9" label="" /></span>
    {!compact && <span className="min-w-0"><span className="brand-logo-word">Placement<span>Hub</span></span>{institution && <span className="brand-logo-subtitle">Apex Institute of Technology</span>}</span>}
  </span>
  return link ? <Link className="shrink-0" to={to} aria-label="PlacementHub home">{content}</Link> : content
}

export function InstitutionSignature({ inverse = false, className = '' }) {
  return <span className={`institution-signature ${inverse ? 'institution-signature-inverse' : ''} ${className}`}><ApexMark className="h-8 w-8" label="" /><span><strong>AIT</strong><small>Apex Institute of Technology</small></span></span>
}
