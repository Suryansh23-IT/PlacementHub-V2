import { useState } from 'react'
import { ProfileIdentity } from '../profiles/ProfileIdentity.jsx'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button.jsx'
import { CommunityComposer } from './CommunityComposer.jsx'
import { CommunityImage } from './CommunityImage.jsx'
import * as social from '../../services/social.service.js'
const stamp = value => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
export const Badge = ({ author }) => <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-800">{author.label}{author.detail ? ` · ${author.detail}` : ''}</span>

export function PostCard({ post, token, refresh, detail = false }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const article = post.contentType === 'article'
  async function change(action) {
    if (busy) return
    setBusy(true); setError('')
    try { await action(); await refresh() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  return <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex items-start justify-between gap-2"><div className="min-w-0">
      <ProfileIdentity author={post.author} token={token} />
      <p className="mt-1 text-xs text-slate-500">{stamp(post.createdAt)}{post.edited ? ' · Edited' : ''}</p>
    </div>{(post.canEdit || post.canDelete || post.canModerate) && <div className="flex gap-2 text-xs font-semibold text-slate-600">{post.canEdit && <button disabled={busy} onClick={() => setEditing(true)}>Edit</button>}{(post.canDelete || post.canModerate) && <button disabled={busy} onClick={() => setConfirmRemove(true)}>Remove</button>}</div>}</div>
    {confirmRemove && <div role="alertdialog" aria-label="Remove community post" className="mt-3 rounded-xl border border-rose-200 p-3 text-sm">
      <p>Remove this {article ? 'article' : 'post'} and its comments?</p>
      <div className="mt-2 flex gap-2"><Button disabled={busy} onClick={() => change(() => social.deleteCommunityPost(token, post._id))}>Confirm remove</Button><Button variant="quiet" disabled={busy} onClick={() => setConfirmRemove(false)}>Cancel removal</Button></div>
    </div>}
    {editing ? <div className="mt-3"><CommunityComposer post={post} busy={busy} onCancel={() => setEditing(false)} onSave={body => change(async () => { await social.updateCommunityPost(token, post._id, body); setEditing(false) })} /></div> : <>
      {article && <><p className="mt-4 text-[10px] font-bold tracking-widest text-blue-800">ARTICLE</p><h2 className="mt-1 break-words text-xl font-extrabold leading-snug text-slate-950">{post.title}</h2></>}
      <p className={`mt-3 whitespace-pre-wrap break-words text-sm text-slate-700 ${article && detail ? 'leading-7' : 'leading-6'}`}>{article && !detail && post.content.length > 220 ? `${post.content.slice(0, 220)}…` : post.content}</p>
      {!article && post.image && <CommunityImage key={post.updatedAt || post._id} post={post} token={token} />}
      {article && !detail && <Link className="mt-3 inline-block text-sm font-bold text-blue-800" to={`/community/posts/${post._id}`}>Read Article</Link>}
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex gap-7 text-sm font-semibold"><button disabled={busy} aria-pressed={post.likedByMe} className="text-blue-800 disabled:opacity-50" onClick={() => change(() => social.likeCommunityPost(token, post._id, post.likedByMe))}>{post.likedByMe ? 'Unlike' : 'Like'}</button><Link className="text-slate-600 hover:text-blue-800" to={`/community/posts/${post._id}`}>Comment</Link></div>
      <div className="mt-1 flex gap-6 text-xs text-slate-500"><span>{post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'}</span><Link to={`/community/posts/${post._id}`}>{post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}</Link></div>
    </div>
  </article>
}
