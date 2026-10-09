import { CommunityNavigation } from '../features/community/CommunityNavigation.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button.jsx'
import { FormField } from '../components/ui/FormField.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { usePlacementCycle } from '../features/placement-cycle/usePlacementCycle.js'
import { appendFeedPage, hasNextPage, communityAvailable, commentSchema } from '../features/community/community-core.js'
import { PostCard } from '../features/community/CommunityPostCard.jsx'
import { CommunityComposer } from '../features/community/CommunityComposer.jsx'
import { CommunityFeed, CommunityComments } from '../features/community/CommunityFeed.jsx'
import * as social from '../services/social.service.js'

export function CommunityPage() {
  const { cycle } = usePlacementCycle()
  const { postId } = useParams()
  const [params, setParams] = useSearchParams()
  const filters = { contentType: params.get('type') === 'article' ? 'article' : 'feed', search: params.get('search') || '', sort: params.get('sort') === 'oldest' ? 'oldest' : 'newest' }
  if (!communityAvailable(cycle.id)) return <ErrorState message="Community is available only in placement cycle 2027." />
  function filter(key, value) { const next = new URLSearchParams(params); next.set(key, value); setParams(next, { replace: true }) }
  return <section className="mx-auto w-full max-w-[660px] space-y-4">
    <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">Community</h1>
    <CommunityNavigation selected={filters.contentType} />
    {!postId && <>

      <div className="flex gap-2"><input aria-label="Search Community" placeholder="Search Community" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={filters.search} onChange={e => filter('search', e.target.value)} /><select aria-label="Sort" className="max-w-28 rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm" value={filters.sort} onChange={e => filter('sort', e.target.value)}><option value="newest">Newest</option><option value="oldest">Oldest</option></select></div>
    </>}
    <CommunityContent key={`${cycle.id}:${postId || JSON.stringify(filters)}`} postId={postId} filters={filters} />
  </section>
}

function CommunityContent({ postId, filters }) {
  const { session } = useAuth()
  const token = session.accessToken
  const [feed, setFeed] = useState(null)
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const morePending = useRef(false)
  const loadedPages = useRef(1)
  const generation = useRef(0)
  const { contentType, search, sort } = filters
  const load = useCallback(async () => {
    const requestGeneration = ++generation.current
    try {
      if (postId) {
        const [p, c] = await Promise.all([social.getCommunityPost(token, postId), social.listCommunityComments(token, postId)])
        if (requestGeneration === generation.current) { setError(''); setPost(p.data); setComments(c.data) }
      } else {
        const pages = await Promise.all(Array.from({ length: loadedPages.current }, (_, index) => social.listCommunityPosts(token, index + 1, { contentType, search, sort })))
        const result = pages.map(page => page.data).reduce((current, next) => current ? appendFeedPage(current, next, sort) : next, null)
        if (requestGeneration === generation.current) { setError(''); setFeed(result); loadedPages.current = Math.min(result.page, result.totalPages) }
      }
    } catch (e) { if (requestGeneration === generation.current) setError(e.message) }
  }, [token, postId, contentType, search, sort])
  // This effect starts an asynchronous server read; state changes occur after its response.
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { void load(); return () => { generation.current += 1 } }, [load])
  async function loadMore() {
    if (morePending.current || !hasNextPage(feed)) return
    morePending.current = true; setLoadingMore(true); setError('')
    const requestGeneration = generation.current
    try {
      const next = (await social.listCommunityPosts(token, feed.page + 1, { contentType, search, sort })).data
      if (requestGeneration === generation.current) { loadedPages.current = next.page; setFeed(current => appendFeedPage(current, next, sort)) }
    } catch (e) { if (requestGeneration === generation.current) setError(e.message) }
    finally { morePending.current = false; setLoadingMore(false) }
  }
  async function publish(body) {
    setBusy(true)
    try { await social.createCommunityPost(token, body); setComposing(false); await load() }
    finally { setBusy(false) }
  }
  async function addComment(event) {
    event.preventDefault()
    const parsed = commentSchema.safeParse({ content: comment })
    if (!parsed.success) return setError(parsed.error.issues[0].message)
    setBusy(true)
    try { await social.createCommunityComment(token, postId, parsed.data); setComment(''); await load() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  async function removeComment(item) {
    setBusy(true)
    try { await social.deleteCommunityComment(token, item._id); await load() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }
  if (error && !feed && !post) return <ErrorState message={error} />
  if (postId && !post) return <LoadingState message="Loading community post…" />
  if (!postId && !feed) return <LoadingState message="Loading community…" />
  return <div className="space-y-4">
    {error && <ErrorState message={error} />}
    {!postId && ['placement_admin', 'company'].includes(session.user.role) && (composing
      ? <CommunityComposer role={session.user.role} contentType={contentType} busy={busy} onSave={publish} onCancel={() => setComposing(false)} />
      : <button className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-900" onClick={() => setComposing(true)}>{contentType === 'article' ? 'New article' : 'New Feed post'}</button>)}
    {postId ? <>
      <Link className="text-sm font-semibold text-blue-800" to={`/community?type=${post.contentType || 'feed'}`}>Back to {post.contentType === 'article' ? 'Articles' : 'Feed'}</Link>
      <PostCard post={post} token={token} refresh={load} detail />
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-bold text-slate-950">Comments</h2>
        <form className="mt-3" onSubmit={addComment}><FormField as="textarea" label="Add a comment" value={comment} onChange={e => setComment(e.target.value)} /><Button className="mt-2" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Comment'}</Button></form>
        <CommunityComments token={token} comments={comments} busy={busy} onRemove={removeComment} />
      </section>
    </> : <CommunityFeed feed={feed} token={token} refresh={load} loadingMore={loadingMore} busy={busy} onLoadMore={loadMore} />}
  </div>
}
