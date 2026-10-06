import ExcelJS from 'exceljs'
import { Application } from '../applications/application.model.js'
import { StudentProfile } from '../students/student.model.js'
import { User } from '../auth/auth.model.js'
import { getCompanyRecruitmentDrive } from './recruitment-workspace.service.js'

function plain(value) { return value?.toObject ? value.toObject() : value }

// Shared by recruitment exports and the Admin Student Explorer. Keep the
// workbook treatment in one place so reports have the same basic safety and
// presentation guarantees without creating a second Excel implementation.
export async function createPlacementWorkbookExport({ title, columns, rows, sheetName = 'Report', filterSummary = '' }) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'PlacementHub V2'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), { views: [{ state: 'frozen', ySplit: 3 }] })
  sheet.mergeCells(1, 1, 1, columns.length)
  sheet.getCell('A1').value = `Apex Institute of Technology | ${title}`
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F2F5F' } }
  sheet.getCell('A2').value = `Generated ${new Date().toLocaleString('en-IN')}${filterSummary ? ` | ${filterSummary}` : ''}`
  sheet.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } }
  sheet.columns = columns.map(({ key, width }) => ({ key, width }))
  const header = sheet.getRow(3)
  header.values = columns.map(column => column.header)
  rows.forEach(row => sheet.addRow(row))
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export function createPlacementWorkbook(title) { const workbook = new ExcelJS.Workbook(); workbook.creator = 'PlacementHub V2'; workbook.created = new Date(); workbook.properties.title = title; return workbook }
export function addPlacementWorksheet(workbook, { title, columns, rows = [], sheetName = 'Report', filterSummary = '' }) {
  const used = new Set(workbook.worksheets.map(sheet => sheet.name)); let safe = String(sheetName).replace(/[\\/?*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Report'; let suffix = 2; while (used.has(safe)) { safe = `${safe.slice(0, 28)} ${suffix++}` }
  const sheet = workbook.addWorksheet(safe, { views: [{ state: 'frozen', ySplit: 3 }] }); sheet.mergeCells(1, 1, 1, columns.length); sheet.getCell('A1').value = `Apex Institute of Technology | ${title}`; sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F2F5F' } }; sheet.getCell('A2').value = `Generated ${new Date().toLocaleString('en-IN')}${filterSummary ? ` | ${filterSummary}` : ''}`; sheet.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } }; sheet.columns = columns.map(({ key, width }) => ({ key, width })); const header = sheet.getRow(3); header.values = columns.map(column => column.header); rows.forEach(row => sheet.addRow(row)); header.font = { bold: true, color: { argb: 'FFFFFFFF' } }; header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } }; return sheet
}
export async function writePlacementWorkbook(workbook) { return Buffer.from(await workbook.xlsx.writeBuffer()) }

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
  const columns = [
    { header: 'Name', key: 'name', width: 26 }, { header: 'Roll Number', key: 'rollNumber', width: 18 }, { header: 'Email', key: 'email', width: 30 }, { header: 'Branch', key: 'branch', width: 28 }, { header: 'CGPA', key: 'cgpa', width: 10 }, { header: 'Current Phase', key: 'phase', width: 16 }, { header: 'Current Status', key: 'status', width: 30 }, { header: 'Confirmation State', key: 'confirmation', width: 28 }, { header: 'Outcome Type', key: 'outcome', width: 22 }, { header: 'Company', key: 'company', width: 26 }, { header: 'Role', key: 'role', width: 30 },
  ]
  const data = await createPlacementWorkbookExport({ title: `${company.companyName ?? 'Company'} candidates`, columns, rows, sheetName: 'Candidates' })
  const suffix = filters.selectedOnly ? 'provisional-selected' : `phase-${filters.phase}`
  return { buffer: data, filename: `${String(company.companyName ?? 'company').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'company'}-${suffix}-candidates.xlsx`, rowCount: rows.length }
}
