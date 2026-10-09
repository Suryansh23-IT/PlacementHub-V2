import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.js'
import { listCommunityNotifications } from '../../services/community-notification.service.js'
export function CommunityNavigation({ selected }) {
  const { session } = useAuth()
  const [unread, setUnread] = useState(null)
  useEffect(() => {
    let active = true
    const load = () => listCommunityNotifications(session.accessToken, { limit: 1 }).then(({ data }) => { if (active) setUnread(data.unreadCount) }).catch(() => { if (active) setUnread(null) })
    void load(); window.addEventListener('community-notifications-changed', load)
    return () => { active = false; window.removeEventListener('community-notifications-changed', load) }
  }, [session.accessToken])
  const id = session.user.id || session.user._id
  const tabs = [['feed','Feed','/community?type=feed'],['article','Articles','/community?type=article'],['profile','Profile',`/community/profiles/${id}`],['notifications','Notifications','/community/notifications']]
  return <nav aria-label="Community navigation"><div role="tablist" aria-label="Community sections" className="flex gap-3 border-b border-slate-200 text-sm font-bold sm:gap-5">{tabs.map(([key,label,to]) => <Link key={key} role="tab" aria-selected={selected === key} className={`min-w-0 border-b-2 pb-3 ${selected === key ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500'}`} to={to}>{label}{key === 'notifications' && unread > 0 && <span className="ml-1 rounded-full bg-blue-900 px-1.5 py-0.5 text-[10px] text-white" aria-label={`${unread} unread Community notifications`}>{unread}</span>}</Link>)}</div></nav>
}
