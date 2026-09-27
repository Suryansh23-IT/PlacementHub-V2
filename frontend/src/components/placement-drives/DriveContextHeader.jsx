import { StatusBadge } from '../ui/StatusBadge.jsx'
import { stableDriveCode } from '../../utils/drive-display.js'

const dateLabel = value => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not set'
const applicationWindowLabel = drive => {
  if (drive.applicationWindow?.reason === 'deadline_passed') return 'Deadline passed'
  if (!drive.applicationWindow?.open) return 'Applications closed'
  return drive.applicationDeadlineExtendedAt ? 'Open · Extended' : 'Open'
}

export function DriveContextHeader({ drive = {}, summary, applicationCount }) {
  const activeApplicants = summary?.applicantCount ?? applicationCount
  const exitedCount = summary?.exitedCount
  const published = drive.lifecycleStatus === 'published'
  const proposalStatus = drive.proposalStatus ?? summary?.proposalStatus
  const applicationsClosed = published && drive.applicationWindow?.open === false
  return <section className={`rounded-2xl border ${published ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-white'} p-4 shadow-sm`}>
    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={proposalStatus}>{proposalStatus?.replaceAll('_', ' ') || 'Proposal'}</StatusBadge><StatusBadge status={applicationsClosed ? 'closed' : drive.lifecycleStatus}>{published ? applicationsClosed ? 'Published · Applications closed' : 'Published · Applications open' : proposalStatus === 'approved' ? 'Approved — not visible to Students yet' : drive.lifecycleStatus?.replaceAll('_', ' ') || 'Unpublished'}</StatusBadge></div>
    {applicationsClosed && <p className="mt-3 text-sm text-slate-600">{drive.applicationWindow.reason === 'manually_closed' ? 'Placement Administration has closed applications.' : 'The application deadline has passed.'} Students can still view this drive, but cannot submit new applications. Existing applications and applicant history are retained.</p>}
    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-6"><ContextItem label="Company" value={drive.company?.companyName || 'Company'} /><ContextItem label="Role" value={drive.role?.title || 'Placement Drive'} /><ContextItem label="Drive code" value={stableDriveCode(drive._id)} /><ContextItem label="Deadline" value={dateLabel(summary?.applicationDeadline || drive.driveDetails?.applicationDeadline)} /><ContextItem label="Applications" value={applicationWindowLabel(drive)} />{activeApplicants != null && <ContextItem label="Applicants" value={activeApplicants} />}{exitedCount != null && <ContextItem label="Withdrawn / exited" value={exitedCount} />}</dl>
  </section>
}

function ContextItem({ label, value }) { return <div><dt className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-800">{value === '' || value == null ? 'Not set' : value}</dd></div> }

