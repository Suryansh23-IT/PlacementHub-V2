import { Link } from 'react-router-dom'
import { ProfileAvatar } from './ProfileAvatar.jsx'
export function ProfileIdentity({ author, token }) {
  const content = <><ProfileAvatar role={author.role} name={author.name} userId={author.userId} hasAvatar={author.hasAvatar} avatarVersion={author.avatarVersion} token={token} circular className="h-9 w-9" /><span className="min-w-0"><span className="block break-words text-sm font-bold text-slate-950">{author.name}</span><span className="block text-xs text-blue-800">{[author.detail, author.label].filter(Boolean).join(' · ')}</span></span></>
  return author.userId ? <Link className="flex min-w-0 items-center gap-2 hover:underline" to={`/community/profiles/${author.userId}`}>{content}</Link> : <span className="flex min-w-0 items-center gap-2">{content}</span>
}
