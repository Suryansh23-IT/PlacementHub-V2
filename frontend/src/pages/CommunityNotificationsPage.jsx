import { useEffect, useState } from 'react'
import { useAuth } from '../features/auth/useAuth.js'
import { usePlacementCycle } from '../features/placement-cycle/usePlacementCycle.js'
import { CommunityNavigation } from '../features/community/CommunityNavigation.jsx'
import { NotificationInbox } from '../components/notifications/NotificationInbox.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { Button } from '../components/ui/Button.jsx'
import * as notifications from '../services/community-notification.service.js'
export function CommunityNotificationsPage() {
  const { cycle } = usePlacementCycle()
  if (cycle.id !== '2027') return <ErrorState message="Community is available only in placement cycle 2027." />
  return <CommunityInbox />
}
function CommunityInbox() {
  const { session } = useAuth(), token = session.accessToken
  const [data, setData] = useState(null), [page, setPage] = useState(1), [error, setError] = useState(''), [busy, setBusy] = useState('')
  useEffect(() => { let active = true; notifications.listCommunityNotifications(token, { page }).then(({ data }) => { if (active) { setData(data); setError('') } }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [token, page])
  async function mark(item) {
    setBusy(item?._id || 'all'); setError('')
    try {
      if (item) await notifications.markCommunityNotificationRead(token,item._id)
      else await notifications.markCommunityNotificationsRead(token)
      setData((await notifications.listCommunityNotifications(token,{page})).data)
      window.dispatchEvent(new window.Event('community-notifications-changed'))
    } catch(e) { setError(e.message) } finally { setBusy('') }
  }
  return <section className="mx-auto w-full max-w-[660px] space-y-4"><h1 className="text-2xl font-extrabold text-slate-950">Community</h1><CommunityNavigation selected="notifications" /><div className="flex items-center justify-between gap-2"><h2 className="font-bold text-blue-950">Community notifications</h2><Button variant="quiet" disabled={Boolean(busy) || !data?.unreadCount} onClick={() => mark()}>Mark all read</Button></div>{error && <ErrorState message={error} />}{!data ? !error && <LoadingState message="Loading Community notifications…" /> : <><NotificationInbox notifications={data.records} community busyId={busy} onMarkRead={mark} emptyTitle="No Community notifications" emptyDescription="Comments on your content and selected Community updates appear here." /><div className="flex justify-between"><Button variant="quiet" disabled={Boolean(busy) || page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-sm">{page} / {data.totalPages}</span><Button variant="quiet" disabled={Boolean(busy) || page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button></div></>}</section>
}
