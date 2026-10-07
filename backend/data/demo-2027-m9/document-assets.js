import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_COMPANIES_2027, CANONICAL_DRIVE_PROPOSALS_2027 } from './canonical-companies-drives.js'
import { CANONICAL_STUDENTS_2027, DEMO_2027_BRANCHES } from './canonical-students.js'

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url))
export const DEMO_2027_ASSET_DIRECTORY = sourceDirectory
export const DEMO_2027_STUDENT_RESUME_DIRECTORY = 'student-resumes'
export const DEMO_2027_COMPANY_DOCUMENT_DIRECTORY = 'company-documents'

const branchCodeByLabel = new Map(DEMO_2027_BRANCHES.map((branch) => [branch.label, branch.code]))
const fileNamePart = (value) => value.replaceAll(' ', '_')
const branchSerials = new Map()
export const CANONICAL_STUDENT_RESUME_DOCUMENTS = Object.freeze(CANONICAL_STUDENTS_2027.map((student) => {
  const serial = (branchSerials.get(student.branch) ?? 0) + 1
  branchSerials.set(student.branch, serial)
  return { studentSourceId: student.sourceId, relativePath: `${DEMO_2027_STUDENT_RESUME_DIRECTORY}/${branchCodeByLabel.get(student.branch)}_${String(serial).padStart(2, '0')}_${fileNamePart(student.name)}_Resume.pdf` }
}))

const companyDocumentFileNames = Object.freeze({
  'codeharbor-technologies': { company_profile: 'CodeHarbor_Technologies_01_Company_Profile.pdf', job_description: 'CodeHarbor_Technologies_02_Cloud_Engineering_Intern_Job_Description.pdf', recruitment_process: 'CodeHarbor_Technologies_03_Recruitment_Process_Instructions.pdf' },
  'nexora-digital-labs': { company_profile: 'Nexora_Digital_Labs_01_Company_Profile.pdf', job_description: 'Nexora_Digital_Labs_02_Backend_Engineer_Job_Description.pdf', recruitment_process: 'Nexora_Digital_Labs_03_Recruitment_Process_Instructions.pdf' },
  'forgeline-industrial-engineering': { company_profile: 'ForgeLine_Industrial_Engineering_01_Company_Profile.pdf', job_description: 'ForgeLine_Industrial_Engineering_02_Graduate_Engineering_Roles_Job_Description.pdf', recruitment_process: 'ForgeLine_Industrial_Engineering_03_Recruitment_Process_Instructions.pdf' },
  'insightforge-analytics': { company_profile: 'InsightForge_Analytics_01_Company_Profile.pdf', job_description: 'InsightForge_Analytics_02_Data_Analyst_Job_Description.pdf', recruitment_process: 'InsightForge_Analytics_03_Recruitment_Process_Instructions.pdf' },
  'voltedge-power-systems': { company_profile: 'VoltEdge_Power_Systems_01_Company_Profile.pdf', job_description: 'VoltEdge_Power_Systems_02_Graduate_Electrical_Engineer_Job_Description.pdf', recruitment_process: 'VoltEdge_Power_Systems_03_Recruitment_Process_Instructions.pdf' },
})

export const CANONICAL_COMPANY_DOCUMENTS = Object.freeze(CANONICAL_COMPANIES_2027.flatMap((company) => Object.entries(companyDocumentFileNames[company.key]).map(([documentType, fileName]) => ({ companyKey: company.key, documentType, relativePath: `${DEMO_2027_COMPANY_DOCUMENT_DIRECTORY}/${fileName}` }))))
const companyDocumentPath = (companyKey, documentType) => CANONICAL_COMPANY_DOCUMENTS.find((document) => document.companyKey === companyKey && document.documentType === documentType)?.relativePath
export const CANONICAL_DRIVE_DOCUMENT_MAPPINGS = Object.freeze(CANONICAL_DRIVE_PROPOSALS_2027.map((drive) => ({ driveKey: drive.key, companyKey: drive.companyKey, companyProfilePath: companyDocumentPath(drive.companyKey, 'company_profile'), jobDescriptionPath: companyDocumentPath(drive.companyKey, 'job_description'), recruitmentInstructionsPath: companyDocumentPath(drive.companyKey, 'recruitment_process') })))

export function resolveDemo2027AssetPath(relativePath, assetDirectory = DEMO_2027_ASSET_DIRECTORY) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) throw new Error('Demo asset paths must be non-empty relative paths.')
  const root = path.resolve(assetDirectory); const resolved = path.resolve(root, relativePath); const relative = path.relative(root, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Demo asset path escapes the dedicated M9A demo-data directory.')
  return resolved
}

const unique = (values) => new Set(values).size === values.length
const fileExists = (relativePath, assetDirectory, exists) => {
  const resolved = resolveDemo2027AssetPath(relativePath, assetDirectory)
  return exists ? exists(resolved) : existsSync(resolved) && statSync(resolved).isFile()
}

export function validateDemo2027DocumentAssets({ assetDirectory = DEMO_2027_ASSET_DIRECTORY, studentDocuments = CANONICAL_STUDENT_RESUME_DOCUMENTS, companyDocuments = CANONICAL_COMPANY_DOCUMENTS, driveMappings = CANONICAL_DRIVE_DOCUMENT_MAPPINGS, exists } = {}) {
  const issues = []; const studentsById = new Set(CANONICAL_STUDENTS_2027.map((student) => student.sourceId)); const companiesByKey = new Set(CANONICAL_COMPANIES_2027.map((company) => company.key)); const drivesByKey = new Map(CANONICAL_DRIVE_PROPOSALS_2027.map((drive) => [drive.key, drive]))
  if (studentDocuments.length !== 60) issues.push(`Expected 60 student resume mappings; received ${studentDocuments.length}.`)
  if (!unique(studentDocuments.map((document) => document.studentSourceId)) || !unique(studentDocuments.map((document) => document.relativePath))) issues.push('Student resume mappings must have unique students and unique paths.')
  if (companyDocuments.length !== 15) issues.push(`Expected 15 company document mappings; received ${companyDocuments.length}.`)
  if (!unique(companyDocuments.map((document) => `${document.companyKey}:${document.documentType}`)) || !unique(companyDocuments.map((document) => document.relativePath))) issues.push('Company document mappings must have unique company/type pairs and unique paths.')
  if (driveMappings.length !== CANONICAL_DRIVE_PROPOSALS_2027.length || !unique(driveMappings.map((mapping) => mapping.driveKey))) issues.push('Every canonical drive must have exactly one document mapping.')
  for (const document of studentDocuments) { if (!studentsById.has(document.studentSourceId)) issues.push(`Resume mapping references unknown student ${document.studentSourceId}.`); try { if (!fileExists(document.relativePath, assetDirectory, exists)) issues.push(`Missing resume asset ${document.relativePath}.`) } catch (error) { issues.push(`Invalid resume asset ${document.relativePath}: ${error.message}`) } }
  for (const document of companyDocuments) { if (!companiesByKey.has(document.companyKey)) issues.push(`Company document references unknown company ${document.companyKey}.`); if (!['company_profile', 'job_description', 'recruitment_process'].includes(document.documentType)) issues.push(`Unknown company document type ${document.documentType}.`); try { if (!fileExists(document.relativePath, assetDirectory, exists)) issues.push(`Missing company asset ${document.relativePath}.`) } catch (error) { issues.push(`Invalid company asset ${document.relativePath}: ${error.message}`) } }
  for (const mapping of driveMappings) { const drive = drivesByKey.get(mapping.driveKey); if (!drive) { issues.push(`Document mapping references unknown drive ${mapping.driveKey}.`); continue }; if (mapping.companyKey !== drive.companyKey) issues.push(`Drive ${mapping.driveKey} is mapped to the wrong company.`); const expected = [companyDocumentPath(drive.companyKey, 'company_profile'), companyDocumentPath(drive.companyKey, 'job_description'), companyDocumentPath(drive.companyKey, 'recruitment_process')]; const actual = [mapping.companyProfilePath, mapping.jobDescriptionPath, mapping.recruitmentInstructionsPath]; if (expected.some((item, index) => item !== actual[index])) issues.push(`Drive ${mapping.driveKey} has a non-deterministic company document mapping.`) }
  for (const company of CANONICAL_COMPANIES_2027) { const types = companyDocuments.filter((document) => document.companyKey === company.key).map((document) => document.documentType).sort(); if (types.join('|') !== 'company_profile|job_description|recruitment_process') issues.push(`Company ${company.key} must have one profile, job description, and recruitment-process PDF.`) }
  if (issues.length) throw new Error(`Invalid 2027 document assets:\n- ${issues.join('\n- ')}`)
  return { studentResumeCount: studentDocuments.length, companyDocumentCount: companyDocuments.length, driveDocumentMappingCount: driveMappings.length }
}
