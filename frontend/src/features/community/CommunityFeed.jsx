import { useState } from 'react'
import { Button } from '../../components/ui/Button.jsx'
import { ProfileIdentity } from '../profiles/ProfileIdentity.jsx'
import { PostCard } from './CommunityPostCard.jsx'
import { hasNextPage } from './community-core.js'

export function CommunityFeed({ feed, token, refresh, loadingMore, busy, onLoadMore }) {
  return <div className="space-y-4">
    {feed.records.length ? feed.records.map(item => <PostCard key={item._id} post={item} token={token} refresh={refresh} />)
      : <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-600">No community updates yet. Updates from Placement Administration and Companies matching your search will appear here.</p>}
    {hasNextPage(feed) && <Button variant="secondary" disabled={loadingMore || busy} onClick={onLoadMore}>{loadingMore ? 'Loading more…' : 'Load more'}</Button>}
  </div>
}

export function CommunityComments({ comments, busy, onRemove, token }) {
  const [confirmId, setConfirmId] = useState(null)
  return <div className="mt-6 space-y-4">{comments.length ? comments.map(item => <article key={item._id} className="border-t border-slate-100 pt-4">
    <div className="flex justify-between gap-3"><div>
      <ProfileIdentity author={item.author} token={token} />
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.content}</p>
      <small className="text-slate-500">{new Date(item.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small>
    </div>{item.canDelete && <Button variant="quiet" disabled={busy} onClick={() => setConfirmId(item._id)}>Remove</Button>}</div>
    {item.canDelete && confirmId === item._id && <div role="alertdialog" aria-label="Remove community comment" className="mt-3 rounded-xl border border-rose-200 p-3"><p>Remove this comment?</p><div className="mt-2 flex gap-2"><Button disabled={busy} onClick={async () => { await onRemove(item); setConfirmId(null) }}>Confirm remove</Button><Button variant="secondary" disabled={busy} onClick={() => setConfirmId(null)}>Cancel removal</Button></div></div>}
  </article>) : <p className="text-sm text-slate-500">No comments yet. Start a useful conversation.</p>}</div>
}
