import { PlacementRecord } from '../placements/placement-record.model.js'
import { StudentProfile } from '../students/student.model.js'
import { getInstitutionProfile } from '../institution/institution.service.js'
import { Application } from '../applications/application.model.js'
import { Company } from '../companies/company.model.js'
import { PlacementDrive } from '../placement-drives/placement-drive.model.js'
import mongoose from 'mongoose'

// A confirmed PlacementRecord is authoritative for participation and statistics.
// All supported confirmed outcomes, including a plain internship, are placements.
export const PLACEMENT_EQUIVALENT_OUTCOMES = Object.freeze(['full_time', 'ppo', 'internship_and_ppo', 'internship'])

const plain = value => value?.toObject ? value.toObject() : value
const values = async result => {
  return result?.lean ? result.lean() : await result
}
const id = value => String(value?._id ?? value)

export function isCollegePlacementEligible(profile, rules = {}) {
  if (profile.verificationStatus !== 'verified') return false
  if (profile.cgpa == null || profile.cgpa < (rules.minimumCgpa ?? 0)) return false
  if (profile.activeBacklogs == null || profile.activeBacklogs > (rules.maximumActiveBacklogs ?? 100)) return false
  const years = rules.graduationYears ?? []
  return years.length === 0 || years.includes(profile.graduationYear)
}

export function packageStatistics(records) {
  const amounts = records
    .filter(record => record.package?.currency === 'INR' && record.package?.period === 'per_annum' && Number(record.package?.amount) > 0)
    .map(record => Number(record.package.amount))
    .sort((left, right) => left - right)
  if (!amounts.length) return { highest: null, median: null, average: null, lowest: null }
  const middle = Math.floor(amounts.length / 2)
  return {
    highest: amounts.at(-1),
    median: amounts.length % 2 ? amounts[middle] : (amounts[middle - 1] + amounts[middle]) / 2,
    average: amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length,
    lowest: amounts[0],
  }
}

function cohortQuery(filters) {
  const query = {}
  const graduationYear = filters.graduationYear ?? filters.batch
  if (graduationYear != null) query.graduationYear = graduationYear
  if (filters.branch) query.branch = filters.branch
  if (filters.minCpi != null || filters.maxCpi != null) query.cgpa = { ...(filters.minCpi != null ? { $gte: filters.minCpi } : {}), ...(filters.maxCpi != null ? { $lte: filters.maxCpi } : {}) }
  if (filters.verificationStatus) query.verificationStatus = filters.verificationStatus
  return query
}

function recordQuery(filters) {
  const query = { verificationState: 'confirmed' }
  if (filters.company) query.companyId = filters.company
  if (filters.drive) query.placementDriveId = filters.drive
  if (filters.outcomeType) query.outcomeType = filters.outcomeType
  if (filters.placementSource) query.placementSource = filters.placementSource
  if (filters.dateFrom || filters.dateTo) query.adminVerifiedAt = { ...(filters.dateFrom ? { $gte: filters.dateFrom } : {}), ...(filters.dateTo ? { $lte: endOfDay(filters.dateTo) } : {}) }
  return query
}

function endOfDay(date) { const result = new Date(date); result.setHours(23, 59, 59, 999); return result }

function dateQuery(field, filters) { return filters.dateFrom || filters.dateTo ? { [field]: { ...(filters.dateFrom ? { $gte: filters.dateFrom } : {}), ...(filters.dateTo ? { $lte: endOfDay(filters.dateTo) } : {}) } } : {} }
function monthKey(value) { return value ? new Date(value).toISOString().slice(0, 7) : null }
function statusCount(items, status) { return items.filter(item => item.currentStatus === status).length }
const objectId = value => mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : value
const recordMatch = filters => ({ verificationState: 'confirmed', ...(filters.company ? { companyId: objectId(filters.company) } : {}), ...(filters.drive ? { placementDriveId: objectId(filters.drive) } : {}), ...(filters.outcomeType ? { outcomeType: filters.outcomeType } : {}), ...dateQuery('adminVerifiedAt', filters) })
const applicationMatch = filters => ({ ...(filters.drive ? { placementDriveId: objectId(filters.drive) } : {}), ...dateQuery('appliedAt', filters) })
const eligibleExpression = rules => ({ $and: [{ $eq: ['$verificationStatus', 'verified'] }, { $gte: ['$cgpa', rules?.minimumCgpa ?? 0] }, { $lte: ['$activeBacklogs', rules?.maximumActiveBacklogs ?? 100] }, ...((rules?.graduationYears ?? []).length ? [{ $in: ['$graduationYear', rules.graduationYears] }] : [])] })

export async function getAdminAnalyticsSummary(filters = {}, {
  studentProfileModel = StudentProfile,
  placementRecordModel = PlacementRecord,
  institutionService = getInstitutionProfile,
} = {}) {
  const [institution, rawProfiles, rawRecords, rawPendingRecords] = await Promise.all([
    institutionService(),
    values(studentProfileModel.find(cohortQuery(filters))),
    values(placementRecordModel.find(recordQuery(filters))),
    values(placementRecordModel.find({ ...recordQuery(filters), verificationState: 'pending_admin_verification', outcomeType: filters.outcomeType ?? { $in: ['full_time', 'internship', 'ppo', 'internship_and_ppo'] } })),
  ])
  const profiles = (rawProfiles ?? []).map(plain)
  const profileIds = new Set(profiles.map(profile => id(profile.userId)))
  const records = (rawRecords ?? []).map(plain).filter(record => profileIds.has(id(record.studentId)))
  const pendingRecords = (rawPendingRecords ?? []).map(plain).filter(record => profileIds.has(id(record.studentId)))
  const eligibleProfiles = profiles.filter(profile => isCollegePlacementEligible(profile, institution?.collegeEligibility))
  const eligibleIds = new Set(eligibleProfiles.map(profile => id(profile.userId)))
  const placedIds = new Set(records.filter(record => PLACEMENT_EQUIVALENT_OUTCOMES.includes(record.outcomeType)).map(record => id(record.studentId)).filter(studentId => eligibleIds.has(studentId)))
  const placedEligibleStudents = placedIds.size
  const filteredProfiles = filters.collegeEligibility === 'eligible' ? eligibleProfiles : filters.collegeEligibility === 'ineligible' ? profiles.filter(profile => !eligibleIds.has(id(profile.userId))) : profiles
  const pendingIds = new Set(pendingRecords.map(record => id(record.studentId)))
  const placementStatusProfiles = filters.placementStatus === 'placed'
    ? filteredProfiles.filter(profile => placedIds.has(id(profile.userId)))
    : filters.placementStatus === 'confirmation_pending'
      ? filteredProfiles.filter(profile => pendingIds.has(id(profile.userId)))
    : filters.placementStatus === 'offer_received'
        ? filteredProfiles.filter(profile => pendingIds.has(id(profile.userId)) || records.some(record => id(record.studentId) === id(profile.userId)))
      : filters.placementStatus === 'unplaced'
        ? filteredProfiles.filter(profile => !placedIds.has(id(profile.userId)) && !pendingIds.has(id(profile.userId)))
    : filters.placementStatus === 'unplaced_eligible'
      ? filteredProfiles.filter(profile => eligibleIds.has(id(profile.userId)) && !placedIds.has(id(profile.userId)))
      : filteredProfiles
  const totalStudents = placementStatusProfiles.length
  const eligibleStudents = placementStatusProfiles.filter(profile => eligibleIds.has(id(profile.userId))).length
  const ineligibleStudents = totalStudents - eligibleStudents
  const placedInScope = placementStatusProfiles.filter(profile => placedIds.has(id(profile.userId))).length
  const denominator = eligibleProfiles.length
  return {
    filters,
    cohort: {
      totalStudents,
      eligibleStudents,
      ineligibleStudents,
      placedEligibleStudents: placedInScope,
      unplacedEligibleStudents: eligibleStudents - placedInScope,
      eligiblePlacementRate: denominator ? (placedEligibleStudents / denominator) * 100 : 0,
      wholeBatchPlacementRate: profiles.length ? (placedEligibleStudents / profiles.length) * 100 : 0,
      offersReceived: records.length + pendingRecords.length,
      confirmationPending: pendingRecords.length,
      confirmedOffers: records.length,
    },
    packages: packageStatistics(records),
  }
}

// One bounded set of collection reads feeds every M8B section; there are no
// per-student or per-company reads. M8C/M8E reuse the same filter helpers.
export async function getAdminAnalyticsDashboard(filters = {}, dependencies = {}) {
  const { studentProfileModel = StudentProfile, placementRecordModel = PlacementRecord, applicationModel = Application, companyModel = Company, placementDriveModel = PlacementDrive, institutionService = getInstitutionProfile } = dependencies
  // The shared in-memory projection is the authoritative M8 semantic layer:
  // it combines pending and confirmed PlacementRecords before deriving unique
  // placed students. Keep dashboard and report definitions identical.
  const [institution, rawProfiles, rawCompanies, rawDrives] = await Promise.all([
    institutionService(), values(studentProfileModel.find(cohortQuery(filters))), values(companyModel.find({})), values(placementDriveModel.find({})),
  ])
  const profiles = (rawProfiles ?? []).map(plain); const companies = (rawCompanies ?? []).map(plain); const allDrives = (rawDrives ?? []).map(plain)
  const driveScope = allDrives.filter(drive => (!filters.company || id(drive.companyId) === String(filters.company)) && (!filters.drive || id(drive) === String(filters.drive)))
  const driveIds = driveScope.map(drive => drive._id)
  const applicationQuery = { ...(filters.company || filters.drive ? { placementDriveId: { $in: driveIds } } : {}), ...dateQuery('appliedAt', filters) }
  const allRecordQuery = { verificationState: 'confirmed', ...(filters.company ? { companyId: filters.company } : {}), ...(filters.drive ? { placementDriveId: filters.drive } : {}), ...(filters.outcomeType ? { outcomeType: filters.outcomeType } : {}), ...(filters.placementSource ? { placementSource: filters.placementSource } : {}), ...dateQuery('adminVerifiedAt', filters) }
  const [rawApplications, rawRecords] = await Promise.all([values(applicationModel.find(applicationQuery)), values(placementRecordModel.find(allRecordQuery))])
  const profileIds = new Set(profiles.map(profile => id(profile.userId)));
  const applications = (rawApplications ?? []).map(plain).filter(application => profileIds.has(id(application.studentId))); const confirmedRecords = (rawRecords ?? []).map(plain).filter(record => profileIds.has(id(record.studentId)))
  const qualifyingRecords = confirmedRecords.filter(record => PLACEMENT_EQUIVALENT_OUTCOMES.includes(record.outcomeType))
  const eligibleProfiles = profiles.filter(profile => isCollegePlacementEligible(profile, institution?.collegeEligibility))
  const eligibleIds = new Set(eligibleProfiles.map(profile => id(profile.userId)))
  const qualifiedPlacedIds = new Set(qualifyingRecords.map(record => id(record.studentId)).filter(studentId => eligibleIds.has(studentId)))
  const activeDrives = driveScope.filter(drive => drive.lifecycleStatus === 'published')
  const completedDrives = driveScope.filter(drive => drive.lifecycleStatus === 'completed')
  const drivesByCompany = new Map()
  const companyByDrive = new Map()
  const applicationsByCompany = new Map()
  const recordsByCompany = new Map()
  for (const drive of allDrives) {
    const companyId = id(drive.companyId)
    companyByDrive.set(id(drive), companyId)
    const companyDrives = drivesByCompany.get(companyId) ?? []
    companyDrives.push(drive)
    drivesByCompany.set(companyId, companyDrives)
  }
  for (const application of applications) {
    const companyId = companyByDrive.get(id(application.placementDriveId))
    if (!companyId) continue
    const companyApplications = applicationsByCompany.get(companyId) ?? []
    companyApplications.push(application)
    applicationsByCompany.set(companyId, companyApplications)
  }
  for (const record of confirmedRecords) {
    const companyId = id(record.companyId)
    const companyRecords = recordsByCompany.get(companyId) ?? []
    companyRecords.push(record)
    recordsByCompany.set(companyId, companyRecords)
  }
  const branchPerformance = [...new Set(profiles.map(profile => profile.branch).filter(Boolean))].sort().map(branch => {
    const rows = profiles.filter(profile => profile.branch === branch); const eligible = rows.filter(profile => eligibleIds.has(id(profile.userId))); const placed = eligible.filter(profile => qualifiedPlacedIds.has(id(profile.userId)))
    return { branch, totalStudents: rows.length, eligibleStudents: eligible.length, placedStudents: placed.length, unplacedEligibleStudents: eligible.length - placed.length, eligiblePlacementRate: eligible.length ? (placed.length / eligible.length) * 100 : 0 }
  })
  const companyPerformance = companies.map(company => {
    const companyId = id(company); const companyDrives = drivesByCompany.get(companyId) ?? []; const companyApps = applicationsByCompany.get(companyId) ?? []; const companyRecords = recordsByCompany.get(companyId) ?? []; const packageValues = packageStatistics(companyRecords.filter(record => PLACEMENT_EQUIVALENT_OUTCOMES.includes(record.outcomeType)))
    const activity = [...companyApps.map(item => item.updatedAt ?? item.appliedAt), ...companyRecords.map(item => item.adminVerifiedAt ?? item.updatedAt)].filter(Boolean).sort().at(-1)
    return { companyId: company._id, companyName: company.companyName ?? 'Company', driveCount: companyDrives.length, activeDriveCount: companyDrives.filter(drive => drive.lifecycleStatus === 'published').length, applicants: companyApps.length, provisionalSelected: statusCount(companyApps, 'selected_pending_confirmation'), confirmedPlacements: companyRecords.filter(record => PLACEMENT_EQUIVALENT_OUTCOMES.includes(record.outcomeType)).length, highestPackage: packageValues.highest, latestActivityAt: activity ?? null }
  }).filter(item => item.driveCount || !filters.company)
  const outcomes = ['full_time', 'ppo', 'internship', 'internship_and_ppo'].map(outcomeType => ({ outcomeType, count: confirmedRecords.filter(record => record.outcomeType === outcomeType).length }))
  const timelineMap = new Map()
  for (const application of applications) { const key = monthKey(application.appliedAt); if (key) timelineMap.set(key, { month: key, applications: (timelineMap.get(key)?.applications ?? 0) + 1, confirmations: timelineMap.get(key)?.confirmations ?? 0 }) }
  for (const record of confirmedRecords) { const key = monthKey(record.adminVerifiedAt); if (key) timelineMap.set(key, { month: key, applications: timelineMap.get(key)?.applications ?? 0, confirmations: (timelineMap.get(key)?.confirmations ?? 0) + 1 }) }
  const phases = filters.drive ? [0, ...(driveScope[0]?.phases ?? []).map(phase => phase.phaseNumber)] : [...new Set(applications.map(application => application.currentPhase))].sort((left, right) => left - right)
  const funnel = { applicants: applications.length, phases: phases.map(phaseNumber => ({ phaseNumber, count: applications.filter(application => application.currentPhase === phaseNumber && ['applied', 'active'].includes(application.currentStatus)).length })), provisionalSelected: statusCount(applications, 'selected_pending_confirmation'), confirmedPlacements: applications.filter(application => application.currentStatus === 'placement_confirmed').length, exited: { rejected: statusCount(applications, 'rejected'), absent: statusCount(applications, 'absent'), withdrawn: statusCount(applications, 'withdrawn'), closedPlacedElsewhere: statusCount(applications, 'closed_placed_elsewhere') } }
  const companyById = new Map(companies.map(company => [id(company), company]))
  const studentScoped = Boolean(filters.branch || filters.graduationYear || filters.batch || filters.minCpi != null || filters.maxCpi != null || filters.verificationStatus)
  return { summary: await getAdminAnalyticsSummary(filters, { studentProfileModel, placementRecordModel, institutionService }), recruitment: { companyCount: companies.filter(company => company.approvalStatus === 'approved').length, activeDriveCount: activeDrives.length, completedDriveCount: completedDrives.length }, branchPerformance, companyPerformance: companyPerformance.filter(item => filters.company ? item.companyId === filters.company : !studentScoped || item.applicants || item.confirmedPlacements), outcomes, timeline: [...timelineMap.values()].sort((left, right) => left.month.localeCompare(right.month)), funnel, options: { branches: [...(institution?.branches ?? [])].sort(), companies: companies.filter(company => company.approvalStatus === 'approved').map(company => ({ id: String(company._id), name: company.companyName })), drives: allDrives.map(drive => ({ id: String(drive._id), companyId: String(drive.companyId), label: `${drive.role?.title ?? 'Drive'} · ${companyById.get(id(drive.companyId))?.companyName ?? 'Company'}` })) } }
}

async function getAdminAnalyticsDashboardAggregated(filters, { studentProfileModel, placementRecordModel, applicationModel, companyModel, placementDriveModel, institutionService }) {
  const institution = await institutionService(); const rules = institution?.collegeEligibility ?? {}; const profileMatch = cohortQuery(filters); const recordsCollection = placementRecordModel.collection.name; const applicationsCollection = applicationModel.collection.name; const drivesCollection = placementDriveModel.collection.name; const companiesCollection = companyModel.collection.name
  const filteredRecordMatch = recordMatch(filters); const placementLookup = { $lookup: { from: recordsCollection, let: { studentId: '$userId' }, pipeline: [{ $match: { $expr: { $eq: ['$studentId', '$$studentId'] }, ...filteredRecordMatch, outcomeType: { $in: PLACEMENT_EQUIVALENT_OUTCOMES } } }, { $project: { _id: 1 } }], as: 'placements' } }
  const profilePipeline = [{ $match: profileMatch }, placementLookup, { $set: { collegeEligible: eligibleExpression(rules), placed: { $gt: [{ $size: '$placements' }, 0] } } }]
  const profileScope = []
  if (filters.collegeEligibility === 'eligible') profileScope.push({ $match: { collegeEligible: true } }); if (filters.collegeEligibility === 'ineligible') profileScope.push({ $match: { collegeEligible: false } }); if (filters.placementStatus === 'placed') profileScope.push({ $match: { placed: true } }); if (filters.placementStatus === 'unplaced_eligible') profileScope.push({ $match: { collegeEligible: true, placed: false } })
  const [profileResult, recordResult, applicationResult, companyResult, driveOptions] = await Promise.all([
    studentProfileModel.aggregate([...profilePipeline, ...profileScope, { $facet: { summary: [{ $group: { _id: null, totalStudents: { $sum: 1 }, eligibleStudents: { $sum: { $cond: ['$collegeEligible', 1, 0] } }, placedEligibleStudents: { $sum: { $cond: [{ $and: ['$collegeEligible', '$placed'] }, 1, 0] } } } }], branches: [{ $group: { _id: '$branch', totalStudents: { $sum: 1 }, eligibleStudents: { $sum: { $cond: ['$collegeEligible', 1, 0] } }, placedStudents: { $sum: { $cond: [{ $and: ['$collegeEligible', '$placed'] }, 1, 0] } } } }, { $sort: { _id: 1 } }], branches: [{ $group: { _id: '$branch' } }, { $sort: { _id: 1 } }] } }]),
    placementRecordModel.aggregate([{ $match: filteredRecordMatch }, { $facet: { outcomes: [{ $group: { _id: '$outcomeType', count: { $sum: 1 } } }], packages: [{ $match: { outcomeType: { $in: PLACEMENT_EQUIVALENT_OUTCOMES }, 'package.currency': 'INR', 'package.period': 'per_annum', 'package.amount': { $gt: 0 } } }, { $sort: { 'package.amount': 1 } }, { $group: { _id: null, values: { $push: '$package.amount' }, lowest: { $first: '$package.amount' }, highest: { $last: '$package.amount' }, average: { $avg: '$package.amount' } } }], timeline: [{ $group: { _id: { $dateToString: { format: '%Y-%m', date: '$adminVerifiedAt' } }, confirmations: { $sum: 1 } } }, { $sort: { _id: 1 } }] } }]),
    applicationModel.aggregate([{ $match: applicationMatch(filters) }, { $facet: { funnel: [{ $group: { _id: null, applicants: { $sum: 1 }, provisionalSelected: { $sum: { $cond: [{ $eq: ['$currentStatus', 'selected_pending_confirmation'] }, 1, 0] } }, confirmedPlacements: { $sum: { $cond: [{ $eq: ['$currentStatus', 'placement_confirmed'] }, 1, 0] } }, rejected: { $sum: { $cond: [{ $eq: ['$currentStatus', 'rejected'] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$currentStatus', 'absent'] }, 1, 0] } }, withdrawn: { $sum: { $cond: [{ $eq: ['$currentStatus', 'withdrawn'] }, 1, 0] } }, closedPlacedElsewhere: { $sum: { $cond: [{ $eq: ['$currentStatus', 'closed_placed_elsewhere'] }, 1, 0] } } } }], phases: [{ $match: { currentStatus: { $in: ['applied', 'active'] } } }, { $group: { _id: '$currentPhase', count: { $sum: 1 } } }, { $sort: { _id: 1 } }], timeline: [{ $group: { _id: { $dateToString: { format: '%Y-%m', date: '$appliedAt' } }, applications: { $sum: 1 } } }, { $sort: { _id: 1 } }] } }]),
    companyModel.aggregate([{ $match: { approvalStatus: 'approved', ...(filters.company ? { _id: objectId(filters.company) } : {}) } }, { $lookup: { from: drivesCollection, localField: '_id', foreignField: 'companyId', as: 'drives' } }, { $unwind: { path: '$drives', preserveNullAndEmptyArrays: true } }, { $lookup: { from: applicationsCollection, let: { driveId: '$drives._id' }, pipeline: [{ $match: { $expr: { $eq: ['$placementDriveId', '$$driveId'] }, ...applicationMatch(filters) } }], as: 'applications' } }, { $lookup: { from: recordsCollection, let: { companyId: '$_id' }, pipeline: [{ $match: { $expr: { $eq: ['$companyId', '$$companyId'] }, ...filteredRecordMatch } }], as: 'records' } }, { $group: { _id: '$_id', companyName: { $first: '$companyName' }, driveCount: { $sum: { $cond: [{ $ifNull: ['$drives._id', false] }, 1, 0] } }, activeDriveCount: { $sum: { $cond: [{ $eq: ['$drives.lifecycleStatus', 'published'] }, 1, 0] } }, applications: { $push: '$applications' }, records: { $first: '$records' } } }, { $project: { companyName: 1, driveCount: 1, activeDriveCount: 1, flatApplications: { $reduce: { input: '$applications', initialValue: [], in: { $concatArrays: ['$$value', '$$this'] } } }, records: 1 } }, { $project: { companyName: 1, driveCount: 1, activeDriveCount: 1, applicants: { $size: '$flatApplications' }, provisionalSelected: { $size: { $filter: { input: '$flatApplications', as: 'app', cond: { $eq: ['$$app.currentStatus', 'selected_pending_confirmation'] } } } }, confirmedPlacements: { $size: { $filter: { input: '$records', as: 'record', cond: { $in: ['$$record.outcomeType', PLACEMENT_EQUIVALENT_OUTCOMES] } } } }, latestActivityAt: { $max: '$flatApplications.updatedAt' } } }]),
    placementDriveModel.aggregate([{ $lookup: { from: companiesCollection, localField: 'companyId', foreignField: '_id', as: 'company' } }, { $unwind: { path: '$company', preserveNullAndEmptyArrays: true } }, { $project: { id: '$_id', label: { $concat: [{ $ifNull: ['$role.title', 'Drive'] }, ' · ', { $ifNull: ['$company.companyName', 'Company'] }] } } }]),
  ])
  const profile = profileResult[0] ?? {}; const summaryRow = profile.summary?.[0] ?? { totalStudents: 0, eligibleStudents: 0, placedEligibleStudents: 0 }; const packages = recordResult[0]?.packages?.[0]; const packageValues = packages?.values ?? []; const midpoint = Math.floor(packageValues.length / 2); const median = packageValues.length ? (packageValues.length % 2 ? packageValues[midpoint] : (packageValues[midpoint - 1] + packageValues[midpoint]) / 2) : null
  const total = summaryRow.totalStudents; const eligible = summaryRow.eligibleStudents; const placed = summaryRow.placedEligibleStudents; const app = applicationResult[0] ?? {}; const funnelRow = app.funnel?.[0] ?? {}; const phaseCounts = app.phases ?? []; const configured = filters.drive ? await placementDriveModel.findById(objectId(filters.drive)).select('phases').lean() : null; const phaseNumbers = configured ? [0, ...(configured.phases ?? []).map(item => item.phaseNumber)] : phaseCounts.map(item => item._id)
  const timeline = new Map(); for (const item of app.timeline ?? []) timeline.set(item._id, { month: item._id, applications: item.applications, confirmations: 0 }); for (const item of recordResult[0]?.timeline ?? []) timeline.set(item._id, { ...(timeline.get(item._id) ?? { month: item._id, applications: 0 }), confirmations: item.confirmations })
  return { summary: { filters, cohort: { totalStudents: total, eligibleStudents: eligible, ineligibleStudents: total - eligible, placedEligibleStudents: placed, unplacedEligibleStudents: eligible - placed, eligiblePlacementRate: eligible ? placed / eligible * 100 : 0, wholeBatchPlacementRate: total ? placed / total * 100 : 0, confirmedOffers: (recordResult[0]?.outcomes ?? []).filter(item => PLACEMENT_EQUIVALENT_OUTCOMES.includes(item._id)).reduce((sum, item) => sum + item.count, 0) }, packages: { highest: packages?.highest ?? null, median, average: packages?.average ?? null, lowest: packages?.lowest ?? null } }, recruitment: { companyCount: companyResult.length, activeDriveCount: companyResult.reduce((sum, item) => sum + item.activeDriveCount, 0), completedDriveCount: 0 }, branchPerformance: (profile.branches ?? []).map(item => ({ branch: item._id, totalStudents: item.totalStudents, eligibleStudents: item.eligibleStudents, placedStudents: item.placedStudents, unplacedEligibleStudents: item.eligibleStudents - item.placedStudents, eligiblePlacementRate: item.eligibleStudents ? item.placedStudents / item.eligibleStudents * 100 : 0 })), companyPerformance: companyResult.map(item => ({ ...item, companyId: item._id, highestPackage: null })), outcomes: ['full_time', 'ppo', 'internship', 'internship_and_ppo'].map(outcomeType => ({ outcomeType, count: (recordResult[0]?.outcomes ?? []).find(item => item._id === outcomeType)?.count ?? 0 })), timeline: [...timeline.values()].sort((left, right) => left.month.localeCompare(right.month)), funnel: { applicants: funnelRow.applicants ?? 0, phases: phaseNumbers.map(phaseNumber => ({ phaseNumber, count: phaseCounts.find(item => item._id === phaseNumber)?.count ?? 0 })), provisionalSelected: funnelRow.provisionalSelected ?? 0, confirmedPlacements: funnelRow.confirmedPlacements ?? 0, exited: { rejected: funnelRow.rejected ?? 0, absent: funnelRow.absent ?? 0, withdrawn: funnelRow.withdrawn ?? 0, closedPlacedElsewhere: funnelRow.closedPlacedElsewhere ?? 0 } }, options: { branches: [...(institution?.branches ?? [])].sort(), companies: companyResult.map(item => ({ id: String(item._id), name: item.companyName })), drives: driveOptions.map(item => ({ id: String(item.id), label: item.label })) } }
}
