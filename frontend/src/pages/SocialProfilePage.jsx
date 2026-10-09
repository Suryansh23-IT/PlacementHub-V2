import { CommunityNavigation } from '../features/community/CommunityNavigation.jsx'
import { SocialProfileEditor } from '../features/profiles/SocialProfileEditor.jsx'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth.js'
import { usePlacementCycle } from '../features/placement-cycle/usePlacementCycle.js'
import { LoadingState } from '../components/feedback/LoadingState.jsx'
import { ErrorState } from '../components/feedback/ErrorState.jsx'
import { SocialProfileView, MainProfileView } from '../features/profiles/ProfileViews.jsx'
import { getSocialProfile, getStudentMainProfile } from '../services/profile.service.js'
export function SocialProfilePage({ main = false }) {
  const { cycle } = usePlacementCycle()
  const { session } = useAuth()
  const { userId } = useParams()
  if (cycle.id !== '2027') return <ErrorState message="Community profiles are available only in placement cycle 2027." />
  if (main && !['company', 'placement_admin'].includes(session.user.role)) return <ErrorState message="Only Company and Placement Admin may view professional profiles." />
  return <ProfileContent key={`${cycle.id}:${userId}:${main}:${session.user.role}`} userId={userId} main={main} session={session} />
}
function ProfileContent({ userId, main, session }) {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  useEffect(() => { let active = true; const get = main ? getStudentMainProfile : getSocialProfile; get(session.accessToken, userId).then(({ data }) => { if (active) setProfile(data) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [userId, main, session.accessToken])
  return <section className={`mx-auto w-full space-y-4 ${main ? 'max-w-3xl' : 'max-w-[660px]'}`}><CommunityNavigation selected="profile" /><Link className="text-sm font-semibold text-blue-800" to={main ? `/community/profiles/${userId}` : '/community'}>{main ? 'Back to Social Profile' : 'Back to Community'}</Link>{error ? <ErrorState message={error} /> : !profile ? <LoadingState message="Loading profile…" /> : main ? <MainProfileView profile={profile} /> : editing ? <SocialProfileEditor profile={profile} token={session.accessToken} onCancel={() => setEditing(false)} onSaved={value => { setProfile(value); setEditing(false) }} /> : <>{profile.canEdit && <button className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-900" onClick={() => setEditing(true)}>Edit Social Profile</button>}<SocialProfileView profile={profile} viewerRole={session.user.role} token={session.accessToken} /></>}</section>
}
