import { getAdminAnalyticsDashboard } from '../analytics/analytics.service.js'
import { driveCounts, phaseSummary } from '../analytics/reports.service.js'
import { StudentProfile } from '../students/student.model.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import { Application } from '../applications/application.model.js'
import { PlacementRecord } from '../placements/placement-record.model.js'
import { fingerprint, safeProfessionalText } from './ai.context.js'

const round = value => Math.round(Number(value || 0) * 10) / 10
const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, typeof row?.[key] === 'number' ? round(row[key]) : row?.[key] ?? null]))
const sorted = rows => rows.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

// Fixed server-owned reads, never a client/LLM query. No resume or individual DTO.
export async function loadAdminFacts({ dashboard = getAdminAnalyticsDashboard, profileModel = StudentProfile, driveModel = PlacementDrive, applicationModel = Application, recordModel = PlacementRecord } = {}) {
  const [base, profiles, drives, apps, records] = await Promise.all([
    dashboard({}), profileModel.find({}).select('userId branch verificationStatus skills skillGroups').lean(),
    driveModel.find({}).select('_id role.title role.requiredSkills role.preferredSkills lifecycleStatus phases.phaseNumber').lean(),
    applicationModel.find({}).select('_id studentId placementDriveId currentStatus currentPhase phaseHistory.phase phaseHistory.event').lean(),
    recordModel.find({}).select('applicationId verificationState').lean(),
  ])
  const recordBy = new Map(records.filter(row => row.applicationId).map(row => [String(row.applicationId), row]))
  const drivePerformance = drives.map(drive => {
    const rows = apps.filter(app => String(app.placementDriveId) === String(drive._id)).map(app => ({app, confirmation: recordBy.get(String(app._id))?.verificationState}))
    const counts = driveCounts(rows)
    return { id: `drive:${fingerprint(String(drive._id)).slice(0,8)}`, role: safeProfessionalText(drive.role?.title,100), lifecycle: drive.lifecycleStatus, ...counts,
      confirmedOfferConversion: counts.applicants ? round(counts.confirmedOffers / counts.applicants * 100) : null,
      phases: [0,...(drive.phases ?? []).map(row => row.phaseNumber)].map(number => {
        const [label,entered,current,advanced,rejected,absent,withdrawn] = phaseSummary(rows, number)
        return {phaseNumber:number,label,entered,current,advanced,rejected,absent,withdrawn}
      }) }
  })
  const applicantIds = new Set(apps.map(row => String(row.studentId)))
  const skills = new Map(); const demanded = new Map()
  for (const profile of profiles.filter(row => applicantIds.has(String(row.userId)))) {
    const documented = new Set([...(profile.skills ?? []),...(profile.skillGroups ?? []).flatMap(row => row.skills ?? [])].map(value => safeProfessionalText(value,60).toLowerCase()).filter(Boolean))
    for (const skill of documented) skills.set(skill,(skills.get(skill) ?? 0)+1)
  }
  for (const drive of drives.filter(row => ['published','completed'].includes(row.lifecycleStatus))) for (const skill of new Set([...(drive.role?.requiredSkills ?? []),...(drive.role?.preferredSkills ?? [])].map(value => safeProfessionalText(value,60).toLowerCase()).filter(Boolean))) demanded.set(skill,(demanded.get(skill) ?? 0)+1)
  const facts = {
    scope: 'Whole current 2027 runtime; no dashboard filters. Confirmed records, not predictions.',
    summary: {...pick(base.summary.cohort,['totalStudents','eligibleStudents','placedEligibleStudents','unplacedEligibleStudents','eligiblePlacementRate','wholeBatchPlacementRate','confirmedOffers','confirmationPending','offersReceived']), verifiedStudents: profiles.filter(row => row.verificationStatus === 'verified').length},
    packages: pick(base.summary.packages,['highest','median','average','lowest']),
    recruitment: pick(base.recruitment,['companyCount','activeDriveCount','completedDriveCount']),
    branches: sorted(base.branchPerformance.map(row => ({...pick(row,['totalStudents','eligibleStudents','placedStudents','unplacedEligibleStudents','eligiblePlacementRate']), branch:safeProfessionalText(row.branch,60),participatingStudents:profiles.filter(profile=>profile.branch===row.branch&&applicantIds.has(String(profile.userId))).length}))),
    companies: sorted(base.companyPerformance.map(row => ({id:`company:${fingerprint(String(row.companyId)).slice(0,8)}`,name:safeProfessionalText(row.companyName,100),...pick(row,['driveCount','activeDriveCount','applicants','provisionalSelected','confirmedPlacements'])}))),
    drives: sorted(drivePerformance),
    funnel: {applicants:base.funnel.applicants,provisionalSelected:base.funnel.provisionalSelected,confirmedPlacements:base.funnel.confirmedPlacements,exited:pick(base.funnel.exited,['rejected','absent','withdrawn','closedPlacedElsewhere'])},
    outcomes:(base.outcomes??[]).map(row=>pick(row,['outcomeType','count'])),
    trends: sorted(base.timeline.map(row => pick(row,['month','applications','confirmations']))),
    skills: [...skills].map(([skill,applicants]) => ({skill,applicants})).sort((a,b)=>b.applicants-a.applicants||a.skill.localeCompare(b.skill)).slice(0,12),
    demandedSkills: [...demanded].map(([skill,drives])=>({skill,drives})).sort((a,b)=>b.drives-a.drives||a.skill.localeCompare(b.skill)).slice(0,12),
    operationalFlags: {publishedWithoutApplications:drivePerformance.filter(row=>row.lifecycle==='published'&&row.applicants===0).map(row=>row.id),completedDrivesWithApplications:drivePerformance.filter(row=>row.lifecycle==='completed'&&row.applicants>0).length,zeroPlacementBranches:base.branchPerformance.filter(row=>row.eligibleStudents>0&&row.placedStudents===0).length},
    limitations: ['Placement rate uses the college-eligible cohort and confirmed placement-equivalent outcomes.', 'Company confirmedPlacements counts confirmed offer records, not unique hired students.', 'Phase histories are per drive: cross-drive phases are not equivalent; current counts are not stage conversion.', 'Skills are documented structured applicant skills, not proof of ability; no resume cohort scan. Demand and applicant counts use different denominators, not measured gaps.', 'No forecasts, causal proof, or reliable time-to-hire metric is documented.'],
  }
  return facts
}

export function adminContext(facts) {
  const evidence = [{id:'summary',type:'analytics',data:facts.summary},{id:'packages',type:'analytics',data:facts.packages},{id:'recruitment',type:'analytics',data:facts.recruitment},{id:'funnel',type:'analytics',data:facts.funnel}]
  for (const row of facts.branches.slice(0,20)) evidence.push({id:`branch:${fingerprint(row.branch).slice(0,8)}`,type:'analytics',data:row})
  for (const row of [...facts.companies].sort((a,b)=>b.confirmedPlacements-a.confirmedPlacements||a.id.localeCompare(b.id)).slice(0,8)) evidence.push({id:row.id,type:'analytics',data:row})
  for (const row of [...facts.drives].sort((a,b)=>b.applicants-a.applicants||a.id.localeCompare(b.id)).slice(0,10)) evidence.push({id:row.id,type:'analytics',data:row})
  evidence.push({id:'skills',type:'analytics',data:{documented:facts.skills.slice(0,6),demanded:facts.demandedSkills.slice(0,6)}})
  evidence.push({id:'trends',type:'analytics',data:facts.trends.slice(-6)})
  evidence.push({id:'operations',type:'analytics',data:facts.operationalFlags??{}})
  evidence.push({id:'outcomes',type:'analytics',data:facts.outcomes??[]})
  return {kind:'professional',scope:facts.scope,evidence,limitations:facts.limitations,coverage:{branchesIncluded:Math.min(20,facts.branches.length),branchesTotal:facts.branches.length,companiesIncluded:Math.min(8,facts.companies.length),companiesTotal:facts.companies.length,drivesIncluded:Math.min(10,facts.drives.length),drivesTotal:facts.drives.length}}
}
