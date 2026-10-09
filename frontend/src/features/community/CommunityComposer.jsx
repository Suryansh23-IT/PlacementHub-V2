import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button.jsx'
import { FormField } from '../../components/ui/FormField.jsx'
import { postSchema } from './community-core.js'
import { communityPostBody } from '../../services/social.service.js'

export function CommunityComposer({ contentType = 'feed', role = 'placement_admin', post, busy, onSave, onCancel }) {
  const [type, setType] = useState(post?.contentType || contentType)
  const [title, setTitle] = useState(post?.title || '')
  const [content, setContent] = useState(post?.content || '')
  const [image, setImage] = useState(null)
  const [notify, setNotify] = useState(false)
  const [audience, setAudience] = useState('students')
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  async function submit(event) {
    event.preventDefault()
    const parsed = postSchema.safeParse({ contentType: type, title, content })
    if (!parsed.success) return setError(parsed.error.issues[0].message)
    if (type === 'feed' && !image && !post?.image) return setError('Feed requires exactly one image.')
    setError('')
    try { await onSave(communityPostBody({ ...parsed.data, ...(!post && notify ? { notifyCommunity: true, audience } : {}) }, type === 'feed' ? image : null)) }
    catch (e) { setError(e.message) }
  }
  return <form onSubmit={submit} className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
    {!post && <label className="block text-sm font-semibold">Content type<select aria-label="Content type" className="ml-3 rounded-lg border bg-white p-2" value={type} disabled={busy} onChange={e => { setType(e.target.value); setImage(null); setPreview('') }}><option value="feed">Feed</option><option value="article">Article</option></select></label>}
    {type === 'article' && <FormField label="Article title" value={title} onChange={e => setTitle(e.target.value)} maxLength={180} />}
    <FormField as="textarea" label={type === 'article' ? 'Article body' : post ? 'Edit post' : 'Share an update'} value={content} onChange={e => setContent(e.target.value)} className={type === 'article' ? 'min-h-48' : 'min-h-24'} />
    {type === 'feed' && <div className="space-y-2 text-sm">
      <label className="block font-semibold">Feed image (required)<input aria-label="Feed image (required)" className="mt-1 block w-full text-xs" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { const selected = e.target.files?.[0] || null; setImage(selected); setPreview(selected ? URL.createObjectURL(selected) : '') }} /></label>
      <p className="text-xs text-slate-500">Exactly one JPEG, PNG or WebP image, up to 5 MB. Existing images are kept unless replaced.</p>
      {image && preview && <img alt="Selected image preview" src={preview} className="max-h-48 max-w-full rounded-lg object-contain" />}

    </div>}
    {!post && <div className="space-y-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={notify} disabled={busy} onChange={e => setNotify(e.target.checked)} />Notify Community</label>{notify && (role === 'company' ? <p className="text-xs text-slate-500">Students only</p> : <label>Audience<select aria-label="Community audience" className="ml-2 rounded-lg border bg-white p-2" value={audience} disabled={busy} onChange={e => setAudience(e.target.value)}><option value="students">Students</option><option value="companies">Companies</option><option value="everyone">Everyone</option></select></label>)}</div>}
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    <div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : post ? 'Save' : type === 'article' ? 'Publish article' : 'Publish update'}</Button>{onCancel && <Button variant="quiet" disabled={busy} onClick={onCancel}>Cancel</Button>}</div>
  </form>
}
