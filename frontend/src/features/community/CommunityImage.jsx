import { useEffect, useState } from 'react'
import { getCommunityImage } from '../../services/social.service.js'

export function CommunityImage({ post, token }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let objectUrl
    getCommunityImage(token, post._id).then(blob => {
      if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) }
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [post._id, token])
  if (error) return <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>
  if (!url) return <p role="status" className="mt-3 text-sm text-slate-500">Loading image…</p>
  return <img src={url} alt={`Image shared by ${post.author.name}`} className="mt-3 max-h-96 w-full rounded-xl bg-slate-50 object-contain" />
}
