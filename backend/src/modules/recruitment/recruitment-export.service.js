import ExcelJS from 'exceljs'
import { Application } from '../applications/application.model.js'
import { StudentProfile } from '../students/student.model.js'
import { User } from '../auth/auth.model.js'
import { getCompanyRecruitmentDrive } from './recruitment-workspace.service.js'

function plain(value) { return value?.toObject ? value.toObject() : value }

export async function exportCompanyRecruitmentCandidates(companyUserId, driveId, filters, dependencies = {}) {
  const { applicationModel = Application, userModel = User, profileModel = StudentProfile, placementRecordModel = null } = dependencies
  const { company, drive } = await getCompanyRecruitmentDrive(companyUserId, driveId, { ...dependencies, allowInactive: true })
  const query = { placementDriveId: drive._id, ...(filters.selectedOnly ? { currentStatus: { $in: ['selected_pending_confirmation', 'placement_confirmed'] } } : { currentPhase: filters.phase }) }
  const applications = await applicationModel.find(query).sort({ appliedAt: -1 })
  const records = filters.selectedOnly && placementRecordModel ? await placementRecordModel.find({ placementDriveId: drive._id }).sort({ updatedAt: -1 }) : []
  const recordByApplication = new Map(records.map(record => [String(plain(record).applicationId), plain(record)]))
  const rows = await Promise.all(applications.map(async application => {
    const value = plain(application)
    const [user, profile] = await Promise.all([userModel.findOne({ _id: value.studentId, role: 'student' }), profileModel.findOne({ userId: value.studentId })])
    const student = plain(user); const details = plain(profile)
    const record = recordByApplication.get(String(value._id)); return [student?.name ?? '', details?.rollNumber ?? '', student?.email ?? '', details?.branch ?? '', details?.cgpa ?? '', value.currentPhase, value.currentStatus, record?.verificationState ?? 'selected_report_not_submitted', record?.outcomeType ?? '', company.companyName ?? '', drive.role?.title ?? '']
  }))
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PlacementHub V2'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Candidates', { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = [
    { header: 'Name', key: 'name', width: 26 }, { header: 'Roll Number', key: 'rollNumber', width: 18 }, { header: 'Email', key: 'email', width: 30 }, { header: 'Branch', key: 'branch', width: 28 }, { header: 'CGPA', key: 'cgpa', width: 10 }, { header: 'Current Phase', key: 'phase', width: 16 }, { header: 'Current Status', key: 'status', width: 30 }, { header: 'Confirmation State', key: 'confirmation', width: 28 }, { header: 'Outcome Type', key: 'outcome', width: 22 }, { header: 'Company', key: 'company', width: 26 }, { header: 'Role', key: 'role', width: 30 },
  ]
  rows.forEach(row => sheet.addRow(row))
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B21B6' } }
  sheet.autoFilter = { from: 'A1', to: 'K1' }
  const data = await workbook.xlsx.writeBuffer()
  const suffix = filters.selectedOnly ? 'provisional-selected' : `phase-${filters.phase}`
  return { buffer: Buffer.from(data), filename: `${String(company.companyName ?? 'company').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'company'}-${suffix}-candidates.xlsx`, rowCount: rows.length }
}
