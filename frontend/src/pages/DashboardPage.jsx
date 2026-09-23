import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { StatusBadge } from '../components/ui/StatusBadge.jsx'
import { useAuth } from '../features/auth/useAuth.js'
import { getMyStudentProfile } from '../services/student.service.js'
import { getMyStudentPolicy } from '../services/student-policy.service.js'

const ROLE_COPY = {
  student: { eyebrow: 'PlacementHub · NIT Raipur', description: 'Keep your placement record complete and ready for the opportunities ahead.', label: 'Student Placement Portal' },
  company: { eyebrow: 'PlacementHub · NIT Raipur', description: 'Manage your Company profile and every recruitment proposal from one place.', label: 'Campus Recruitment Portal' },
  placement_admin: { eyebrow: 'PlacementHub · NIT Raipur', description: 'Start with the approvals and placement proposals that need your attention.', label: 'Career Development Centre' },
}

export function DashboardPage() {
  const { session } = useAuth()
  const role = session.user.role
  const [policyRequired, setPolicyRequired] = useState(false)
  useEffect(() => { if (role !== 'student') return; Promise.all([getMyStudentProfile(session.accessToken), getMyStudentPolicy(session.accessToken)]).then(([profile, policy]) => setPolicyRequired(profile.data.verificationStatus === 'verified' && !policy.data.acceptance)).catch(() => setPolicyRequired(false)) }, [role, session.accessToken])
  const copy = ROLE_COPY[role]
  const actions = role === 'student' ? [
    ['Placement profile', 'Keep academic details, projects, and documents ready for verification.', '/student/profile', 'Open profile'],
    ['Student policy', 'Review the current placement policy and your agreement status.', '/student/policy', 'Open policy'],
  ] : role === 'company' ? [
    ['Company profile', 'Maintain organization and recruiter details for Placement Cell approval.', '/company/profile', 'Open profile'],
    ['Placement proposals', 'Create and track one structured proposal for each hiring role.', '/company/placement-drives', 'Open proposals'],
    ['Recruiter policy', 'Review the active policy agreement for your organization.', '/company/policy', 'Open policy'],
  ] : [
    ['Review students', 'Open student profiles awaiting placement verification.', '/admin/students', 'Open students'],
    ['Review companies', 'Approve eligible Company profiles for campus participation.', '/admin/companies', 'Open companies'],
    ['Placement proposals', 'Review submitted Company proposals and record a decision.', '/admin/placement-drives', 'Open proposals'],
    ['Institution settings', 'Maintain the shared college profile and branch list.', '/admin/institution', 'Open settings'],
    ['Student policy', 'Manage active Student Placement Policy versions.', '/admin/student-policy', 'Open policy'],
    ['Recruiter policy', 'Manage active Recruiter Placement Policy versions.', '/admin/recruiter-policy', 'Open policy'],
  ]
  return <section className="space-y-8"><PageHeader eyebrow={copy.eyebrow} title={`Welcome back, ${session.user.name}.`} description={copy.description} />{policyRequired && <Link to="/student/policy" className="block rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm"><strong>Placement policy action required</strong><span className="mt-1 block text-sm leading-6">Your placement profile is verified. Review and accept the Student Placement Policy before participating in placement activities.</span></Link>}<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:p-6"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{copy.label}</p><p className="mt-2 text-lg font-bold text-slate-950">Your role: <StatusBadge status="neutral">{role.replace('_', ' ')}</StatusBadge></p></div><p className="mt-3 max-w-md text-sm leading-6 text-slate-600 sm:mt-0">Use the links below to complete the next step in your placement workflow.</p></section><section><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Quick access</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Your workspace</h2></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{actions.map(([title, description, to, action], index) => <DashboardLink key={title} title={title} description={description} to={to} action={action} index={index} />)}</div></section></section>
}

function DashboardLink({ title, description, to, action, index }) {
  return <Link to={to} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"><span className="text-xs font-bold text-violet-700">0{index + 1}</span><h2 className="mt-3 text-lg font-bold text-slate-950">{title}</h2><p className="mt-2 min-h-12 leading-6 text-slate-600">{description}</p><span className="mt-5 inline-flex text-sm font-bold text-violet-700 group-hover:text-violet-800">{action} <span className="ml-1 transition group-hover:translate-x-0.5">→</span></span></Link>
}
